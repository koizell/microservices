import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('daily_sales_tickets')
@Index(['day', 'ticketTypeId'], { unique: true })
export class SalesMetricTicket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'date' })
  day!: string;

  @Column({ name: 'ticket_type_id', type: 'text' })
  ticketTypeId!: string;

  @Column({ name: 'ticket_type_name', type: 'text', nullable: true })
  ticketTypeName?: string | null;

  @Column({ name: 'total_revenue', type: 'numeric', default: 0 })
  totalRevenue!: number;

  @Column({ name: 'total_tickets', default: 0 })
  totalTickets!: number;
}
