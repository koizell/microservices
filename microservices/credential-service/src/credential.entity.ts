import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('credentials')
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  orderItemId: string;

  @Column()
  ticketTypeId: string;

  @Column()
  attendeeName: string;

  @Column({ unique: true })
  qrCodeHash: string;

  @Column({ type: 'varchar', nullable: true, unique: true })
  qrCodeValue: string | null;

  @Column({ default: false })
  isUsed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @Column({ nullable: true })
  usedBy: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  revokedBy: string | null;

  @Column({ type: 'text', nullable: true })
  revokeReason: string | null;
}
