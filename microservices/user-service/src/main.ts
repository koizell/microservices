import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'crypto';
import { AppModule } from './app.module';
import prometheus from 'prom-client';

// Crear un registro de prometheus
const register = new prometheus.Registry();

// Métricas
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

// Agregar métricas por defecto
prometheus.collectDefaultMetrics({ register });

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const server = app.getHttpAdapter().getInstance();

  // Middleware de correlationId
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

      // Registrar en Prometheus
      httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
      httpRequestTotal.inc({ method, route, status_code: statusCode });

      console.log(`[user-service] ${method} ${route} ${statusCode} - ${duration * 1000}ms - ${correlationId}`);
    });
    next();
  });

  // Endpoint para Prometheus
  server.get('/metrics', async (_req: any, res: any) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  app.enableCors();
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
