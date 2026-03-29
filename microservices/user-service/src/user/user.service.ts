import { ConflictException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailService } from './email.service';
import { User } from './user.entity';
import { CreateUserDto } from './user.dto';

function normalizePublicBaseUrl(value: string | undefined, fallback: string) {
	const candidate = String(value ?? fallback)
		.trim()
		.replace(/\/+$/, '');

	if (!candidate) {
		return fallback;
	}

	return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

const ACCOUNT_PERMISSIONS: Record<string, string[]> = {
	admin: ['users:read', 'users:write', 'events:write', 'tickets:write', 'analytics:read'],
	standard: ['users:read', 'events:read', 'tickets:read'],
	guest: ['events:read'],
};

@Injectable()
export class UserService {
	constructor(
		@InjectRepository(User)
		private readonly userRepository: Repository<User>,
		private readonly emailService: EmailService,
	) {}

	private normalizeEmail(email: string) {
		return email.trim().toLowerCase();
	}

	private normalizeAccountType(accountType?: string) {
		const normalized = String(accountType ?? 'guest').trim().toLowerCase();
		if (normalized === 'standar') return 'standard';
		if (normalized === 'invitado') return 'guest';
		return normalized;
	}

	async create(user: CreateUserDto) {
		const normalizedEmail = this.normalizeEmail(user.email);
		const existing = await this.findByEmail(normalizedEmail);
		if (existing) {
			throw new ConflictException('Ya existe una cuenta con ese correo');
		}

		const newUser = this.userRepository.create({
			...user,
			email: normalizedEmail,
			accountType: this.normalizeAccountType(user.accountType ?? 'standard'),
			isEmailVerified: false,
			emailVerificationToken: null,
			emailVerificationExpiresAt: null,
			emailVerifiedAt: null,
		});
		let savedUser = await this.userRepository.save(newUser);
		const emailDispatch = await this.issueVerificationForUser(savedUser);
		savedUser = emailDispatch.user;

		return {
			user: savedUser,
			requiresEmailConfirmation: true,
			emailSent: emailDispatch.sent,
			mailReason: emailDispatch.reason,
			confirmationPreviewUrl: emailDispatch.sent ? undefined : emailDispatch.confirmationUrl,
		};
	}

	async resendConfirmationEmail(email: string) {
		const user = await this.findByEmail(email);
		if (!user) {
			return { accepted: true, status: 'not_found' as const };
		}

		if (user.isEmailVerified) {
			return { accepted: true, status: 'already_verified' as const };
		}

		const emailDispatch = await this.issueVerificationForUser(user);
		return {
			accepted: true,
			status: 'resent' as const,
			emailSent: emailDispatch.sent,
			mailReason: emailDispatch.reason,
			confirmationPreviewUrl: emailDispatch.sent ? undefined : emailDispatch.confirmationUrl,
		};
	}

	async requestPasswordReset(email: string) {
		const user = await this.findByEmail(email);
		if (!user) {
			return { accepted: true, status: 'not_found' as const };
		}

		const resetDispatch = await this.issuePasswordResetForUser(user);
		return {
			accepted: true,
			status: 'sent' as const,
			emailSent: resetDispatch.sent,
			mailReason: resetDispatch.reason,
			resetPreviewUrl: resetDispatch.sent ? undefined : resetDispatch.resetUrl,
		};
	}

	async findAll(limit = 50): Promise<User[]> {
		return await this.userRepository.find({
			take: Math.max(1, Math.min(limit, 100)),
			order: { name: 'ASC' },
		});
	}

	async countAll(): Promise<number> {
		return await this.userRepository.count();
	}

	async findOne(id: string): Promise<User | null> {
		return await this.userRepository.findOneBy({ id });
	}

	async findByEmail(email: string): Promise<User | null> {
		const normalizedEmail = this.normalizeEmail(email);
		return await this.userRepository
			.createQueryBuilder('user')
			.where('LOWER(user.email) = :email', { email: normalizedEmail })
			.getOne();
	}

	async confirmEmail(token: string) {
		const user = await this.userRepository.findOne({
			where: { emailVerificationToken: token },
		});

		if (!user) {
			return { ok: false, reason: 'invalid' };
		}

		if (user.isEmailVerified) {
			return { ok: true, reason: 'already_verified' };
		}

		if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
			return { ok: false, reason: 'expired' };
		}

		user.isEmailVerified = true;
		user.emailVerifiedAt = new Date();
		user.emailVerificationToken = null;
		user.emailVerificationExpiresAt = null;
		await this.userRepository.save(user);

		return { ok: true, reason: 'verified' };
	}

	async resetPassword(token: string, password: string) {
		const user = await this.userRepository.findOne({
			where: { passwordResetToken: token },
		});

		if (!user) {
			return { ok: false, reason: 'invalid' as const };
		}

		if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt.getTime() < Date.now()) {
			return { ok: false, reason: 'expired' as const };
		}

		user.password = password;
		user.passwordResetToken = null;
		user.passwordResetExpiresAt = null;
		user.passwordResetRequestedAt = null;
		await this.userRepository.save(user);

		return { ok: true, reason: 'reset' as const };
	}

	async update(id: string, user: Partial<CreateUserDto>): Promise<User | null> {
		const existing = await this.userRepository.findOneBy({ id });
		if (!existing) {
			return null;
		}
		const updated = this.userRepository.merge(existing, {
			...user,
			email: user.email ? this.normalizeEmail(user.email) : existing.email,
			accountType: user.accountType
				? this.normalizeAccountType(user.accountType)
				: existing.accountType,
		});
		return await this.userRepository.save(updated);
	}

	async remove(id: string): Promise<User | null> {
		const existing = await this.userRepository.findOneBy({ id });
		if (!existing) {
			return null;
		}
		await this.userRepository.remove(existing);
		return existing;
	}

	hasPermission(accountType: string, permission: string): boolean {
		const permissions = ACCOUNT_PERMISSIONS[this.normalizeAccountType(accountType)] ?? [];
		return permissions.includes(permission);
	}

	private async issueVerificationForUser(user: User) {
		const verificationToken = randomBytes(24).toString('hex');
		user.emailVerificationToken = verificationToken;
		user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
		const saved = await this.userRepository.save(user);

		const confirmationUrl = this.buildConfirmationUrl(verificationToken);
		const mailResult = await this.emailService.sendVerificationEmail({
			to: saved.email,
			name: saved.name,
			confirmationUrl,
		});

		return {
			user: saved,
			sent: mailResult.sent,
			reason: mailResult.reason,
			confirmationUrl,
		};
	}

	private buildConfirmationUrl(token: string) {
		const baseUrl = normalizePublicBaseUrl(process.env.APP_BASE_URL, 'http://localhost:3009');
		return `${baseUrl}/users/confirm?token=${token}`;
	}

	private async issuePasswordResetForUser(user: User) {
		const resetToken = randomBytes(24).toString('hex');
		const resetTtlMinutes = Number(process.env.RESET_PASSWORD_TTL_MINUTES ?? 60);
		user.passwordResetToken = resetToken;
		user.passwordResetExpiresAt = new Date(Date.now() + resetTtlMinutes * 60 * 1000);
		user.passwordResetRequestedAt = new Date();
		const saved = await this.userRepository.save(user);

		const resetUrl = this.buildResetUrl(resetToken);
		const mailResult = await this.emailService.sendPasswordResetEmail({
			to: saved.email,
			name: saved.name,
			resetUrl,
		});

		return {
			user: saved,
			sent: mailResult.sent,
			reason: mailResult.reason,
			resetUrl,
		};
	}

	private buildResetUrl(token: string) {
		const baseUrl = normalizePublicBaseUrl(process.env.APP_BASE_URL, 'http://localhost:3009');
		return `${baseUrl}/?resetToken=${encodeURIComponent(token)}`;
	}
}
