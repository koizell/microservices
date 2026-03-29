import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
const amqp: any = require('amqplib');

function getRabbitMqUrl() {
  const configuredUrl = String(process.env.RABBITMQ_URL ?? '').trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const nodeEnv = String(process.env.NODE_ENV ?? '').trim().toLowerCase();
  return nodeEnv === 'production' ? '' : 'amqp://localhost:5672';
}

@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection?: any;
  private channel?: any;

  private async ensureChannel() {
    if (this.channel) {
      return this.channel;
    }

    const url = getRabbitMqUrl();
    if (!url) {
      this.logger.warn('RabbitMQ deshabilitado: define RABBITMQ_URL para habilitar la cola en produccion');
      return undefined;
    }

    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      return this.channel;
    } catch (error) {
      this.logger.warn(`RabbitMQ no disponible (${url}): ${(error as Error).message}`);
      return undefined;
    }
  }

  async consume(queue: string, handler: (payload: any) => Promise<void>) {
    const channel = await this.ensureChannel();
    if (!channel) {
      return;
    }
    await channel.assertQueue(queue, { durable: true });
    await channel.consume(queue, async (message) => {
      if (!message) {
        return;
      }

      try {
        const payload = JSON.parse(message.content.toString());
        await handler(payload);
        channel.ack(message);
      } catch (error) {
        this.logger.error(`Error consuming ${queue}: ${(error as Error).message}`);
        channel.nack(message, false, false);
      }
    });
  }

  async onModuleDestroy() {
    try {
      await this.channel?.close();
      await this.connection?.close();
    } catch {
      // ignore shutdown errors
    }
  }
}
