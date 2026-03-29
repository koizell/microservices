import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Favorite } from './favorite.entity';
import { Session } from './session.entity';

@Injectable()
export class AgendaService {
  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
  ) {}

  async createSession(data: Partial<Session>) {
    const session = this.sessionRepository.create(data);
    return await this.sessionRepository.save(session);
  }

  async listSessions(limit = 50) {
    return await this.sessionRepository.find({
      order: { startTime: 'ASC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  async addFavorite(data: { userId: string; sessionId: string }) {
    const favorite = this.favoriteRepository.create(data);
    return await this.favoriteRepository.save(favorite);
  }

  async listFavoritesByUser(userId: string, limit = 50) {
    return await this.favoriteRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.max(1, Math.min(limit, 100)),
    });
  }

  async getSummary(userId: string) {
    const [sessions, favorites] = await Promise.all([
      this.sessionRepository.count(),
      this.favoriteRepository.count({ where: { userId } }),
    ]);

    return { sessions, favorites };
  }
}
