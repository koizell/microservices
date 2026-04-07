import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesMetricTicket } from './sales-metric-ticket.entity';

@Injectable()
export class SalesMetricTicketRepository {
  constructor(
    @InjectRepository(SalesMetricTicket)
    private readonly repository: Repository<SalesMetricTicket>,
  ) {}

  async findByDayAndTicket(day: string, ticketTypeId: string) {
    return await this.repository.findOne({ where: { day, ticketTypeId } });
  }

  createEmpty(day: string, ticketTypeId: string, ticketTypeName?: string) {
    return this.repository.create({
      day,
      ticketTypeId,
      ticketTypeName: ticketTypeName ?? null,
      totalRevenue: 0,
      totalTickets: 0,
    });
  }

  async save(metric: SalesMetricTicket) {
    return await this.repository.save(metric);
  }

  async listRecentByTicket(ticketTypeId: string, limit: number) {
    return await this.repository.find({
      where: { ticketTypeId },
      order: { day: 'DESC' },
      take: limit,
    });
  }
}
