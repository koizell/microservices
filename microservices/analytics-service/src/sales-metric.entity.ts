import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('daily_sales')
export class SalesMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true })
  day: string;

  @Column({ name: 'total_revenue', type: 'numeric', default: 0 })
  totalRevenue: number;

  @Column({ name: 'total_tickets', default: 0 })
  totalTickets: number;
}
