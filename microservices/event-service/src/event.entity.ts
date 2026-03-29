import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate: string | null;

  @Column({ name: 'start_time', default: '09:00' })
  startTime: string;

  @Column({ name: 'end_time', default: '18:00' })
  endTime: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column()
  location: string;

  @Column({ name: 'active_weekdays', type: 'simple-json', nullable: true })
  activeWeekdays: string[] | null;

  @Column({ name: 'is_archived', default: false })
  isArchived: boolean;

  @Column({ name: 'archived_at', type: 'timestamp', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
