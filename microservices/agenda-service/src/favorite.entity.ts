import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('favorites')
export class Favorite {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  sessionId: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
