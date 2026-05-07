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

function isRabbitMqRequired() {
  const configured = String(process.env.RABBITMQ_REQUIRED ?? '').trim().toLowerCase();
  if (configured === 'true') {
    return true;
  }
  if (configured === 'false') {
    return false;
  }

  const nodeEnv = String(process.env.NODE_ENV ?? '').trim().toLowerCase();
  return nodeEnv === 'production';
}

@Injectable()
export class RabbitMqService implements OnModuleDestroy {
  private readonly logger = new Logger(RabbitMqService.name);
  private connection?: any;
  private channel?: any;
  private channelReady?: Promise<any>;
  private lastError: string | null = null;
  private lastConnectedAt: string | null = null;

  private resetConnectionState(error?: unknown) {
    this.channel = undefined;
    this.connection = undefined;
    this.channelReady = undefined;
    this.lastError = error instanceof Error ? error.message : error ? String(error) : this.lastError;
  }

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
        this.connection.on('close', () => {
          this.logger.warn('RabbitMQ cerro la conexion');
          this.resetConnectionState(new Error('Connection closed'));
        });
        this.connection.on('error', (error: unknown) => {
          this.logger.warn(`RabbitMQ reporto error: ${error instanceof Error ? error.message : String(error)}`);
          this.resetConnectionState(error);
        });
        this.channel = await this.connection.createChannel();
        this.lastError = null;
        this.lastConnectedAt = new Date().toISOString();
        return this.channel;
      } catch (error) {
        this.resetConnectionState(error);
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

  getStatus() {
    return {
      url: getRabbitMqUrl() || 'disabled',
      required: isRabbitMqRequired(),
      connected: Boolean(this.channel),
      lastConnectedAt: this.lastConnectedAt,
      lastError: this.lastError,
    };
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

  async publish(queue: string, payload: unknown) {
    const channel = await this.ensureChannel();
    if (!channel) {
      return;
    }

    await channel.assertQueue(queue, { durable: true });
    const ok = channel.sendToQueue(queue, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
    });

    if (!ok) {
      this.logger.warn(`Queue backpressure for ${queue}`);
    }
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
