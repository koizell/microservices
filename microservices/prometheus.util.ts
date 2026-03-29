import { HttpException, HttpStatus } from '@nestjs/common';
import prometheus from 'prom-client';

// Crear registro global de Prometheus
export const register = new prometheus.Registry();

// Métricas globales
export const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duración de las requests HTTP en segundos',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total de requests HTTP',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const dbQueryDuration = new prometheus.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duración de queries a BD en segundos',
  labelNames: ['operation', 'entity'],
  registers: [register],
});

export const authAttempts = new prometheus.Counter({
  name: 'auth_attempts_total',
  help: 'Total de intentos de autenticación',
  labelNames: ['status', 'method'],
  registers: [register],
});

export const paymentAttempts = new prometheus.Counter({
  name: 'payment_attempts_total',
  help: 'Total de intentos de pago',
  labelNames: ['provider', 'status'],
  registers: [register],
});

export const eventPublished = new prometheus.Counter({
  name: 'events_published_total',
  help: 'Total de eventos publicados',
  labelNames: ['event_type'],
  registers: [register],
});

// Middleware para recopilar métricas HTTP
export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.url;
    const method = req.method;
    const statusCode = res.statusCode;

    httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
    httpRequestTotal.inc({ method, route, status_code: statusCode });
  });

  next();
}

// Función helper para registrar tentativas de autenticación
export function recordAuthAttempt(status: 'success' | 'failure', method: string) {
  authAttempts.inc({ status, method });
}

// Función helper para registrar pagos
export function recordPaymentAttempt(provider: string, status: 'success' | 'failure') {
  paymentAttempts.inc({ provider, status });
}

// Función helper para registrar eventos
export function recordEventPublished(eventType: string) {
  eventPublished.inc({ event_type: eventType });
}
