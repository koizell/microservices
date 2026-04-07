import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { RabbitMqService } from './rabbitmq.service';

@Injectable()
export class AnalyticsIngestionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalyticsIngestionService.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  async onApplicationBootstrap() {
    const subscribed = await this.rabbitMqService.consume('ticket.purchased', async (payload) => {
      const amount = Number(payload?.amount ?? 0);
      const quantity = Number(payload?.quantity ?? 1);
      await this.analyticsService.recordTicketPurchase({
        amount,
        quantity,
        ticketTypeId: payload?.ticketTypeId ?? null,
        ticketTypeName: payload?.ticketTypeName ?? null,
      });
    });

    if (subscribed) {
      this.logger.log('Suscrito a ticket.purchased');
      return;
    }

    this.logger.warn('No se pudo suscribir a ticket.purchased');
  }
}
