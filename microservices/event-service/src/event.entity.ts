import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('events')
export class Event {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  date: Date;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ default: '09:00' })
  startTime: string;

  @Column({ default: '18:00' })
  endTime: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column()
  location: string;

  @Column({ type: 'simple-json', nullable: true })
  activeWeekdays: string[] | null;

  @Column({ default: false })
  isArchived: boolean;

  @Column({ type: 'timestamp', nullable: true })
  archivedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
