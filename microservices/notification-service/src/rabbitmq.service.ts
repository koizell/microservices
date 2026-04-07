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
  private channelReady?: Promise<any>;

  private async ensureChannel() {
    if (this.channel) {
      return this.channel;
    }

    if (this.channelReady) {
      return await this.channelReady;
    }

    const url = getRabbitMqUrl();
    if (!url) {
      this.logger.warn('RabbitMQ deshabilitado: define RABBITMQ_URL para habilitar la cola en produccion');
      return undefined;
    }

    this.channelReady = (async () => {
      try {
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();
        return this.channel;
      } catch (error) {
        this.logger.warn(`RabbitMQ no disponible (${url}): ${(error as Error).message}`);
        return undefined;
      } finally {
        if (!this.channel) {
          this.channelReady = undefined;
        }
      }
    })();

    return await this.channelReady;
  }

  private getPrefetchCount() {
    const raw = Number(process.env.RABBITMQ_PREFETCH ?? 1);
    if (!Number.isFinite(raw) || raw <= 0) {
      return 1;
    }
    return Math.floor(raw);
  }

  async consume(queue: string, handler: (payload: any) => Promise<void>) {
    const channel = await this.ensureChannel();
    if (!channel) {
      return;
    }
    await channel.prefetch(this.getPrefetchCount());
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
