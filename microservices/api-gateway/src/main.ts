import { config as loadEnv } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { GatewayProxyService } from './gateway-proxy.service';
import { GATEWAY_PROXY_PREFIXES } from './gateway.constants';
import * as prometheus from 'prom-client';

const express = require('express');

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

prometheus.collectDefaultMetrics({ register });

async function bootstrap() {
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const server = app.getHttpAdapter().getInstance();
  const gatewayProxyService = app.get(GatewayProxyService);
  const requestBodyLimit = String(process.env.REQUEST_BODY_LIMIT || '6mb').trim() || '6mb';

  server.use(express.json({ limit: requestBodyLimit }));
  server.use(express.urlencoded({ extended: true, limit: requestBodyLimit }));

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
      console.log(`[api-gateway] ${method} ${route} ${statusCode} - ${duration * 1000}ms - ${correlationId}`);
    });
    next();
  });

  server.get('/metrics', async (_req: any, res: any) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // Rate limiter configurable por variable de entorno
  const requestCountByIp = new Map<string, { count: number; resetAt: number }>();
  const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10); // 1 minuto por defecto
  const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "1000", 10); // 1000 por defecto
  app.use((req: any, res: any, next: any) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = RATE_LIMIT_WINDOW_MS;
    const maxRequests = RATE_LIMIT_MAX_REQUESTS;

    const entry = requestCountByIp.get(ip);
    if (!entry || now > entry.resetAt) {
      requestCountByIp.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      return res.status(429).json({ message: 'Rate limit exceeded' });
    }

    entry.count += 1;
    requestCountByIp.set(ip, entry);
    return next();
  });

  app.enableCors();

  server.use(
    GATEWAY_PROXY_PREFIXES.map((prefix) => `/${prefix}`),
    async (req: any, res: any) => {
      await gatewayProxyService.forwardRequest(req, res);
    },
  );

  await app.listen(process.env.PORT ?? 3008, '0.0.0.0');
}
bootstrap();
