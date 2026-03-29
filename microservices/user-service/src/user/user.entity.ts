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

  @Column({ type: 'varchar', default: AccountType.STANDARD })
  accountType: string;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', nullable: true })
  emailVerificationToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  emailVerificationExpiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  passwordResetToken: string | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetRequestedAt: Date | null;
}
