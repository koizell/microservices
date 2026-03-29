import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  ticketId: string;

  @Column({ nullable: true })
  ticketTypeId?: string;

  @Column({ nullable: true })
  ticketTypeName?: string;

  @Column({ default: 1 })
  quantity: number;

  @Column({ type: 'numeric', default: 0 })
  unitPrice: number;

  @Column({ type: 'numeric' })
  totalAmount: number;

  @Column()
  provider: string;

  @Column()
  paymentIntentId: string;

  @Column({ default: 'paid' })
  status: string;

  @Column({ default: 'attendee@example.com' })
  recipientEmail: string;

  @CreateDateColumn()
  createdAt: Date;
}
