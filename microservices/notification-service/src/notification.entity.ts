import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  message: string;

  @Column()
  recipient: string;

  @Column()
  read: boolean;
}
