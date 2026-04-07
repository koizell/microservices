import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import * as prometheus from 'prom-client';

loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '..', '.env'), override: false });

const register = new prometheus.Registry();

const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las requests HTTP',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total de requests HTTP',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const paymentAttempts = new prometheus.Counter({
  name: 'payment_attempts_total',
  help: 'Total de intentos de pago',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const eventsPublished = new prometheus.Counter({
  name: 'events_published_total',
  help: 'Total de eventos publicados a RabbitMQ',
  labelNames: ['event_type'],
  registers: [register],
});

prometheus.collectDefaultMetrics({ register });

function getConfiguredInternalApiKey() {
  return String(process.env.INTERNAL_API_KEY ?? '').trim();
}

function isPublicServicePath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  return normalized === '/metrics' || normalized.endsWith('/health');
}

async function bootstrap() {
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  const server = app.getHttpAdapter().getInstance();

  app.use((req: any, res: any, next: any) => {
    const correlationId = req.headers['x-correlation-id'] ?? randomUUID();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    const startedAt = Date.now();
    res.on('finish', () => {
      const duration = (Date.now() - startedAt) / 1000;
      const route = req.route?.path || req.url;
      const method = req.method;
      const statusCode = res.statusCode;
      httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
      httpRequestTotal.inc({ method, route, status_code: statusCode });
      console.log(`[ticketing-service] ${method} ${route} ${statusCode} - ${duration * 1000}ms - ${correlationId}`);
    });
    next();
  });

  server.get('/metrics', async (_req: any, res: any) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.use((req: any, res: any, next: any) => {
    const internalApiKey = getConfiguredInternalApiKey();
    if (!internalApiKey) {
      next();
      return;
    }

    const pathname = new URL(req.originalUrl || req.url, 'http://ticketing-service.local').pathname;
    if (isPublicServicePath(pathname)) {
      next();
      return;
    }

    const headerValue = req.headers['x-internal-api-key'];
    const providedKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (providedKey === internalApiKey) {
      next();
      return;
    }

    res.status(403).json({ message: 'Acceso directo deshabilitado. Usa el API Gateway.' });
  });

  app.enableCors();
  await app.listen(process.env.PORT ?? 3002, '0.0.0.0');
}
bootstrap();
