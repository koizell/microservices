import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitMqService } from './rabbitmq.service';
import { SalesMetric } from './sales-metric.entity';

@Injectable()
export class AnalyticsService implements OnModuleInit {
  constructor(
    @InjectRepository(SalesMetric)
    private readonly salesRepository: Repository<SalesMetric>,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  async onModuleInit() {
    await this.rabbitMqService.consume('ticket.purchased', async (payload) => {
      await this.ingestTicketPurchased({
        amount: Number(payload.amount ?? 0),
        quantity: Number(payload.quantity ?? 1),
      });
    });
  }

  async ingestTicketPurchased(data: { amount: number; quantity?: number }) {
    const day = new Date().toISOString().slice(0, 10);
    let metric = await this.salesRepository.findOne({ where: { day } });

    if (!metric) {
      metric = this.salesRepository.create({
        day,
        totalRevenue: 0,
        totalTickets: 0,
      });
    }

    metric.totalRevenue = Number(metric.totalRevenue) + Number(data.amount || 0);
    metric.totalTickets = Number(metric.totalTickets) + Number(data.quantity || 1);

    return await this.salesRepository.save(metric);
  }

  async listDailySales(limit = 30) {
    return await this.salesRepository.find({
      order: { day: 'DESC' },
      take: Math.max(1, Math.min(limit, 90)),
    });
  }

  async getSummary() {
    const day = new Date().toISOString().slice(0, 10);
    const [daysTracked, today] = await Promise.all([
      this.salesRepository.count(),
      this.salesRepository.findOne({ where: { day } }),
    ]);

    return {
      daysTracked,
      todayRevenue: Number(today?.totalRevenue ?? 0),
      todayTickets: Number(today?.totalTickets ?? 0),
    };
  }
}
