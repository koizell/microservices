import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum AccountType {
  ADMIN = 'admin',
  STANDARD = 'standard',
  GUEST = 'guest',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ name: 'account_type', type: 'varchar', default: AccountType.STANDARD })
  accountType: string;

  @Column({ name: 'is_email_verified', default: false })
  isEmailVerified: boolean;

  @Column({ name: 'email_verification_token', type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Column({ name: 'email_verification_expires_at', type: 'timestamp', nullable: true })
  emailVerificationExpiresAt: Date | null;

  @Column({ name: 'email_verified_at', type: 'timestamp', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ name: 'password_reset_token', type: 'varchar', nullable: true })
  passwordResetToken: string | null;

  @Column({ name: 'password_reset_expires_at', type: 'timestamp', nullable: true })
  passwordResetExpiresAt: Date | null;

  @Column({ name: 'password_reset_requested_at', type: 'timestamp', nullable: true })
  passwordResetRequestedAt: Date | null;
}
