import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'ticket_id' })
  ticketId: string;

  @Column({ name: 'ticket_type_id', nullable: true })
  ticketTypeId?: string;

  @Column({ name: 'ticket_type_name', nullable: true })
  ticketTypeName?: string;

  @Column({ name: 'quantity', default: 1 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', default: 0 })
  unitPrice: number;

  @Column({ name: 'total_amount', type: 'numeric' })
  totalAmount: number;

  @Column({ name: 'provider' })
  provider: string;

  @Column({ name: 'payment_intent_id' })
  paymentIntentId: string;

  @Column({ name: 'status', default: 'paid' })
  status: string;

  @Column({ name: 'recipient_email', default: 'attendee@example.com' })
  recipientEmail: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}
