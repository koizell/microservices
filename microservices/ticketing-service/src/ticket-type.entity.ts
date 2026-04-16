import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('ticket_types')
export class TicketType {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'price', type: 'numeric' })
  price: number;

  @Column({ name: 'quantity', default: 0 })
  quantity: number;

  @Column({ name: 'quantity_sold', default: 0 })
  quantitySold: number;

  @Column({ name: 'max_per_person', default: 0 })
  maxPerPerson: number;

  @Column({ name: 'event_id', nullable: true })
  eventId?: string;

  @Column({ name: 'organizer_id', nullable: true })
  organizerId?: string;

  @Column({ name: 'organizer_name', nullable: true })
  organizerName?: string;

  @Column({ name: 'organizer_email', nullable: true })
  organizerEmail?: string;

  @Column({ name: 'category', nullable: true })
  category?: string;

  @Column({ name: 'team_image_url', type: 'text', nullable: true })
  teamImageUrl?: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'archived_at', type: 'timestamp', nullable: true })
  archivedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}
