import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('credentials')
export class Credential {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_item_id' })
  orderItemId: string;

  @Column({ name: 'ticket_type_id' })
  ticketTypeId: string;

  @Column({ name: 'attendee_name' })
  attendeeName: string;

  @Column({ name: 'qr_code_hash', unique: true })
  qrCodeHash: string;

  @Column({ name: 'qr_code_value', type: 'varchar', nullable: true, unique: true })
  qrCodeValue: string | null;

  @Column({ name: 'is_used', default: false })
  isUsed: boolean;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @Column({ name: 'used_by', nullable: true })
  usedBy: string | null;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'varchar', nullable: true })
  revokedBy: string | null;

  @Column({ name: 'revoke_reason', type: 'text', nullable: true })
  revokeReason: string | null;
}
