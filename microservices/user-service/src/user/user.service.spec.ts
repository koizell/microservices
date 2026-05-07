import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { User } from './user.entity';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  const queryBuilder = {
    where: jest.fn(),
    getOne: jest.fn(),
  };
  const repository = {
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    merge: jest.fn(),
    remove: jest.fn(),
  };
  const emailService = {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendPasswordChangeConfirmEmail: jest.fn(),
  };

  beforeEach(async () => {
    queryBuilder.where.mockReturnValue(queryBuilder);
    queryBuilder.getOne.mockResolvedValue(null);
    repository.createQueryBuilder.mockReturnValue(queryBuilder);

    repository.create.mockImplementation((entity: any) => entity);
    repository.save.mockImplementation(async (entity: any) => entity);
    repository.merge.mockImplementation((existing: any, partial: any) => Object.assign(existing, partial));

    emailService.sendVerificationEmail.mockResolvedValue({ sent: true, reason: 'sent' });
    emailService.sendPasswordResetEmail.mockResolvedValue({ sent: true, reason: 'sent' });
    emailService.sendPasswordChangeConfirmEmail.mockResolvedValue({ sent: true, reason: 'sent' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: repository },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByEmail', () => {
    it('queries email with a case-insensitive comparison and a safe alias', async () => {
      await service.findByEmail('Test@Example.com');

      expect(repository.createQueryBuilder).toHaveBeenCalledWith('u');
      expect(queryBuilder.where).toHaveBeenCalledWith('LOWER(u.email) = :email', {
        email: 'test@example.com',
      });
      expect(queryBuilder.getOne).toHaveBeenCalled();
    });

    it('trims and lowercases input before querying', async () => {
      await service.findByEmail('  ADMIN@MAIL.COM  ');

      expect(queryBuilder.where).toHaveBeenCalledWith('LOWER(u.email) = :email', {
        email: 'admin@mail.com',
      });
    });
  });

  describe('create', () => {
    it('throws ConflictException when an account with the same email already exists', async () => {
      queryBuilder.getOne.mockResolvedValueOnce({ id: 'existing-user', email: 'a@b.com' });

      await expect(
        service.create({ name: 'Bob', email: 'a@b.com', password: 'x', accountType: 'standard' } as any),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repository.save).not.toHaveBeenCalled();
    });

    it('normalizes email and accountType, persists, and dispatches verification email', async () => {
      queryBuilder.getOne.mockResolvedValueOnce(null);

      const result = await service.create({
        name: 'Bob',
        email: '  Bob@Example.COM ',
        password: 'pwd',
        accountType: 'STANDAR',
      } as any);

      const created = repository.create.mock.calls[0][0];
      expect(created.email).toBe('bob@example.com');
      expect(created.accountType).toBe('standard');
      expect(created.isEmailVerified).toBe(false);

      // After issueVerificationForUser, the second save call carries the token + expiration.
      const persistedWithToken = repository.save.mock.calls[1][0];
      expect(persistedWithToken.emailVerificationToken).toEqual(expect.any(String));
      expect((persistedWithToken.emailVerificationToken as string).length).toBeGreaterThan(20);
      expect(persistedWithToken.emailVerificationExpiresAt).toBeInstanceOf(Date);

      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'bob@example.com',
          name: 'Bob',
          confirmationUrl: expect.stringContaining('/users/confirm?token='),
        }),
      );

      expect(result.requiresEmailConfirmation).toBe(true);
      expect(result.emailSent).toBe(true);
    });

    it('returns a preview confirmation URL when the email cannot be sent', async () => {
      queryBuilder.getOne.mockResolvedValueOnce(null);
      emailService.sendVerificationEmail.mockResolvedValueOnce({ sent: false, reason: 'smtp_disabled' });

      const result = await service.create({
        name: 'Alice',
        email: 'alice@mail.com',
        password: 'pwd',
      } as any);

      expect(result.emailSent).toBe(false);
      expect(result.mailReason).toBe('smtp_disabled');
      expect(result.confirmationPreviewUrl).toMatch(/users\/confirm\?token=/);
    });

    it('defaults the accountType to "standard" when none is provided', async () => {
      queryBuilder.getOne.mockResolvedValueOnce(null);

      await service.create({ name: 'Eve', email: 'eve@mail.com', password: 'p' } as any);

      const created = repository.create.mock.calls[0][0];
      expect(created.accountType).toBe('standard');
    });
  });

  describe('confirmEmail', () => {
    it('returns invalid when the token does not match any user', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      await expect(service.confirmEmail('bad-token')).resolves.toEqual({ ok: false, reason: 'invalid' });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('is idempotent: already verified user returns ok=true without re-saving', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'u1',
        isEmailVerified: true,
        emailVerificationExpiresAt: new Date(Date.now() + 60000),
      });

      await expect(service.confirmEmail('token')).resolves.toEqual({ ok: true, reason: 'already_verified' });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects an expired verification token', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'u1',
        isEmailVerified: false,
        emailVerificationExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.confirmEmail('token')).resolves.toEqual({ ok: false, reason: 'expired' });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects when the user has no expiration timestamp at all', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'u1',
        isEmailVerified: false,
        emailVerificationExpiresAt: null,
      });

      await expect(service.confirmEmail('token')).resolves.toEqual({ ok: false, reason: 'expired' });
    });

    it('marks the user as verified and clears the token on success', async () => {
      const user: any = {
        id: 'u1',
        isEmailVerified: false,
        emailVerificationExpiresAt: new Date(Date.now() + 60000),
        emailVerificationToken: 'tok-1',
        emailVerifiedAt: null,
      };
      repository.findOne.mockResolvedValueOnce(user);

      const result = await service.confirmEmail('tok-1');

      expect(result).toEqual({ ok: true, reason: 'verified' });
      expect(user.isEmailVerified).toBe(true);
      expect(user.emailVerificationToken).toBeNull();
      expect(user.emailVerificationExpiresAt).toBeNull();
      expect(user.emailVerifiedAt).toBeInstanceOf(Date);
      expect(repository.save).toHaveBeenCalledWith(user);
    });
  });

  describe('resetPassword', () => {
    it('rejects an invalid reset token', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      await expect(service.resetPassword('bad', 'newpwd')).resolves.toEqual({
        ok: false,
        reason: 'invalid',
      });
    });

    it('rejects an expired reset token', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'u1',
        passwordResetExpiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.resetPassword('tok', 'newpwd')).resolves.toEqual({
        ok: false,
        reason: 'expired',
      });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('updates the password and clears token + expiration + requestedAt on success', async () => {
      const user: any = {
        id: 'u1',
        password: 'old',
        passwordResetToken: 'tok',
        passwordResetExpiresAt: new Date(Date.now() + 60000),
        passwordResetRequestedAt: new Date(),
      };
      repository.findOne.mockResolvedValueOnce(user);

      const result = await service.resetPassword('tok', 'NEW-PASS');

      expect(result).toEqual({ ok: true, reason: 'reset' });
      expect(user.password).toBe('NEW-PASS');
      expect(user.passwordResetToken).toBeNull();
      expect(user.passwordResetExpiresAt).toBeNull();
      expect(user.passwordResetRequestedAt).toBeNull();
      expect(repository.save).toHaveBeenCalledWith(user);
    });
  });

  describe('updateProfile', () => {
    it('returns not_found when the user id does not exist', async () => {
      repository.findOneBy.mockResolvedValueOnce(null);

      await expect(service.updateProfile('missing', { name: 'X' } as any)).resolves.toEqual({
        ok: false,
        reason: 'not_found',
      });
    });

    it('requires currentPassword when changing the name', async () => {
      repository.findOneBy.mockResolvedValueOnce({ id: 'u1', name: 'Bob', password: 'pwd' });

      await expect(service.updateProfile('u1', { name: 'Alice' } as any)).resolves.toEqual({
        ok: false,
        reason: 'password_required',
      });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects when the currentPassword does not match', async () => {
      repository.findOneBy.mockResolvedValueOnce({ id: 'u1', name: 'Bob', password: 'pwd' });

      await expect(
        service.updateProfile('u1', { name: 'Alice', currentPassword: 'wrong' } as any),
      ).resolves.toEqual({ ok: false, reason: 'wrong_current_password' });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('updates the name when currentPassword matches', async () => {
      const user: any = { id: 'u1', name: 'Bob', password: 'pwd', avatarUrl: null };
      repository.findOneBy.mockResolvedValueOnce(user);

      const result = await service.updateProfile('u1', { name: '  Alice ', currentPassword: 'pwd' } as any);

      expect(result.ok).toBe(true);
      expect(user.name).toBe('Alice');
      expect(repository.save).toHaveBeenCalledWith(user);
    });

    it('updates only the avatarUrl without requiring currentPassword', async () => {
      const user: any = { id: 'u1', name: 'Bob', password: 'pwd', avatarUrl: null };
      repository.findOneBy.mockResolvedValueOnce(user);

      const result = await service.updateProfile('u1', { avatarUrl: 'https://cdn/x.png' } as any);

      expect(result.ok).toBe(true);
      expect(user.avatarUrl).toBe('https://cdn/x.png');
    });

    it('clears the avatar when an empty string is provided', async () => {
      const user: any = { id: 'u1', name: 'Bob', password: 'pwd', avatarUrl: 'old' };
      repository.findOneBy.mockResolvedValueOnce(user);

      await service.updateProfile('u1', { avatarUrl: '' } as any);

      expect(user.avatarUrl).toBeNull();
    });
  });

  describe('requestPasswordChange', () => {
    it('returns not_found when no user matches', async () => {
      repository.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.requestPasswordChange('missing', { currentPassword: 'p', newPassword: 'np' } as any),
      ).resolves.toEqual({ ok: false, reason: 'not_found' });
    });

    it('rejects when the currentPassword does not match', async () => {
      repository.findOneBy.mockResolvedValueOnce({ id: 'u1', password: 'pwd' });

      await expect(
        service.requestPasswordChange('u1', { currentPassword: 'wrong', newPassword: 'np' } as any),
      ).resolves.toEqual({ ok: false, reason: 'wrong_current_password' });
      expect(emailService.sendPasswordChangeConfirmEmail).not.toHaveBeenCalled();
    });

    it('persists pending hash + token + expiration and dispatches confirm email', async () => {
      const user: any = {
        id: 'u1',
        password: 'pwd',
        email: 'user@mail.com',
        name: 'Bob',
      };
      repository.findOneBy.mockResolvedValueOnce(user);

      const result = await service.requestPasswordChange('u1', {
        currentPassword: 'pwd',
        newPassword: 'NEW',
      } as any);

      expect(user.passwordChangeToken).toEqual(expect.any(String));
      expect((user.passwordChangeToken as string).length).toBeGreaterThan(20);
      expect(user.passwordChangePendingHash).toBe('NEW');
      expect(user.passwordChangeExpiresAt).toBeInstanceOf(Date);

      const expiresInMs = user.passwordChangeExpiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(29 * 60 * 1000);
      expect(expiresInMs).toBeLessThanOrEqual(30 * 60 * 1000);

      expect(emailService.sendPasswordChangeConfirmEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@mail.com',
          name: 'Bob',
          changeUrl: expect.stringContaining('changePasswordToken='),
        }),
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('confirmPasswordChange', () => {
    it('rejects an unknown token', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      await expect(service.confirmPasswordChange('bad')).resolves.toEqual({
        ok: false,
        reason: 'invalid',
      });
    });

    it('rejects an expired token', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'u1',
        passwordChangeExpiresAt: new Date(Date.now() - 1000),
        passwordChangePendingHash: 'NEW',
      });

      await expect(service.confirmPasswordChange('tok')).resolves.toEqual({
        ok: false,
        reason: 'expired',
      });
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects when the pending hash is missing', async () => {
      repository.findOne.mockResolvedValueOnce({
        id: 'u1',
        passwordChangeExpiresAt: new Date(Date.now() + 60000),
        passwordChangePendingHash: null,
      });

      await expect(service.confirmPasswordChange('tok')).resolves.toEqual({
        ok: false,
        reason: 'invalid',
      });
    });

    it('promotes the pending hash to the password and clears all pending fields', async () => {
      const user: any = {
        id: 'u1',
        password: 'old',
        passwordChangeToken: 'tok',
        passwordChangeExpiresAt: new Date(Date.now() + 60000),
        passwordChangePendingHash: 'NEW',
      };
      repository.findOne.mockResolvedValueOnce(user);

      const result = await service.confirmPasswordChange('tok');

      expect(result).toEqual({ ok: true });
      expect(user.password).toBe('NEW');
      expect(user.passwordChangeToken).toBeNull();
      expect(user.passwordChangeExpiresAt).toBeNull();
      expect(user.passwordChangePendingHash).toBeNull();
      expect(repository.save).toHaveBeenCalledWith(user);
    });
  });

  describe('hasPermission', () => {
    it('grants admin all configured permissions', () => {
      expect(service.hasPermission('admin', 'users:write')).toBe(true);
      expect(service.hasPermission('admin', 'analytics:read')).toBe(true);
    });

    it('denies admin permissions to standard users', () => {
      expect(service.hasPermission('standard', 'users:write')).toBe(false);
      expect(service.hasPermission('standard', 'analytics:read')).toBe(false);
      expect(service.hasPermission('standard', 'tickets:read')).toBe(true);
    });

    it('handles legacy "standar" alias as standard', () => {
      expect(service.hasPermission('standar', 'tickets:read')).toBe(true);
    });

    it('grants only events:read to guest accounts', () => {
      expect(service.hasPermission('guest', 'events:read')).toBe(true);
      expect(service.hasPermission('guest', 'tickets:read')).toBe(false);
    });

    it('returns false for unknown account types', () => {
      expect(service.hasPermission('unknown-role', 'events:read')).toBe(false);
    });
  });

  describe('resendConfirmationEmail', () => {
    it('returns not_found without throwing when email is unknown', async () => {
      queryBuilder.getOne.mockResolvedValueOnce(null);

      await expect(service.resendConfirmationEmail('ghost@mail.com')).resolves.toEqual({
        accepted: true,
        status: 'not_found',
      });
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('returns already_verified for users that completed verification', async () => {
      queryBuilder.getOne.mockResolvedValueOnce({ id: 'u1', isEmailVerified: true });

      await expect(service.resendConfirmationEmail('user@mail.com')).resolves.toEqual({
        accepted: true,
        status: 'already_verified',
      });
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('reissues the verification email when the user is unverified', async () => {
      const user: any = { id: 'u1', isEmailVerified: false, email: 'u@mail.com', name: 'Bob' };
      queryBuilder.getOne.mockResolvedValueOnce(user);

      const result = await service.resendConfirmationEmail('u@mail.com');

      expect(result.status).toBe('resent');
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
      expect(user.emailVerificationToken).toEqual(expect.any(String));
    });
  });
});
