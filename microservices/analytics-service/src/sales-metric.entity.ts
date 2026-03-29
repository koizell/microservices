import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('daily_sales')
export class SalesMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'date', unique: true })
  day: string;

  @Column({ type: 'numeric', default: 0 })
  totalRevenue: number;

  @Column({ default: 0 })
  totalTickets: number;
}
