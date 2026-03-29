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

  async publish(queue: string, payload: unknown): Promise<boolean> {
    const channel = await this.ensureChannel();
    if (!channel) {
      return false;
    }
    await channel.assertQueue(queue, { durable: true });
    const ok = channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
    });

    if (!ok) {
      this.logger.warn(`Queue backpressure for ${queue}`);
    }

    return ok;
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
