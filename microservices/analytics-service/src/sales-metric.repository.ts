import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesMetric } from './sales-metric.entity';

@Injectable()
export class SalesMetricRepository {
  constructor(
    @InjectRepository(SalesMetric)
    private readonly repository: Repository<SalesMetric>,
  ) {}

  async findByDay(day: string) {
    return await this.repository.findOne({ where: { day } });
  }

  createEmpty(day: string) {
    return this.repository.create({
      day,
      totalRevenue: 0,
      totalTickets: 0,
    });
  }

  async save(metric: SalesMetric) {
    return await this.repository.save(metric);
  }

  async countDays() {
    return await this.repository.count();
  }

  async listRecent(limit: number) {
    return await this.repository.find({
      order: { day: 'DESC' },
      take: limit,
    });
  }
}
