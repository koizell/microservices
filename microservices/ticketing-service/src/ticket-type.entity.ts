import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ticket_types')
export class TicketType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'numeric' })
  price: number;

  @Column({ default: 0 })
  quantity: number;

  @Column({ default: 0 })
  quantitySold: number;

  @Column({ default: 0 })
  maxPerPerson: number;

  @Column({ nullable: true })
  eventId?: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
