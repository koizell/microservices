import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  buildServiceBaseUrlCandidates,
  GATEWAY_PREFIX_TO_SERVICE,
  GatewayServiceKey,
  GATEWAY_SERVICE_CONFIG,
  resolveGatewayServiceUrlCandidates,
  resolveGatewayServiceUrls,
} from './gateway.constants';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const REQUEST_BLOCKED_HEADERS = new Set([...HOP_BY_HOP_HEADERS, 'accept-encoding']);
const RESPONSE_BLOCKED_HEADERS = new Set([...HOP_BY_HOP_HEADERS, 'content-encoding', 'etag']);

@Injectable()
export class GatewayProxyService {
  private readonly logger = new Logger(GatewayProxyService.name);
  private readonly serviceUrls = resolveGatewayServiceUrls();
  private readonly serviceUrlCandidates = resolveGatewayServiceUrlCandidates();

  constructor(private readonly jwtService: JwtService) {}

  get services() {
    return this.serviceUrls;
  }

  async requestService(service: GatewayServiceKey, path: string, init?: RequestInit) {
    return await this.fetchServiceResponse(service, path, {
      ...init,
      headers: this.buildInternalHeaders(this.normalizeStringHeaders(init?.headers)),
    });
  }

  urlFor(service: GatewayServiceKey, path: string) {
    return `${this.serviceUrls[service]}${path}`;
  }

  buildInternalHeaders(headers: Record<string, string> = {}) {
    const normalized: Record<string, string> = { ...headers };
    const internalApiKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
    if (internalApiKey) {
      normalized['x-internal-api-key'] = internalApiKey;
    }
    normalized['x-forwarded-by'] = 'api-gateway';
    return normalized;
  }

  verifyAuthorizationIfPresent(authorization?: string) {
    if (!authorization) {
      return;
    }

    if (!authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException('Formato de autorizacion invalido');
    }

    const token = authorization.slice('Bearer '.length);
    try {
      this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET ?? 'dev_only_change_me',
      });
    } catch {
      throw new UnauthorizedException('Token invalido');
    }
  }

  async safeFetch<T>(service: GatewayServiceKey, path: string, fallback: T, init?: RequestInit): Promise<T> {
    try {
      const response = await this.requestService(service, path, init);
      if (!response.ok) {
        return fallback;
      }
      return (await response.json()) as T;
    } catch {
      return fallback;
    }
  }

  async postJson(service: GatewayServiceKey, path: string, payload: unknown, init?: RequestInit) {
    const response = await this.requestService(service, path, {
      method: 'POST',
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...this.normalizeStringHeaders(init?.headers),
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    return await response.json();
  }

  async forwardRequest(req: any, res: any) {
    const requestUrl = new URL(req.originalUrl || req.url, 'http://api-gateway.local');
    const pathSegments = requestUrl.pathname.split('/').filter(Boolean);
    const prefix = pathSegments[0];
    const service = prefix ? GATEWAY_PREFIX_TO_SERVICE[prefix] : undefined;

    if (!service) {
      res.status(404).json({ message: 'Ruta no soportada por el API Gateway' });
      return;
    }

    this.verifyAuthorizationIfPresent(typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined);

    const requestInit: RequestInit = {
      method: req.method,
      headers: this.extractForwardHeaders(req.headers),
      redirect: 'manual',
    };

    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      const body = await this.readRequestBody(req);
      if (typeof body !== 'undefined') {
        requestInit.body = body;
      }
    }

    try {
      const upstream = await this.fetchServiceResponse(service, `${requestUrl.pathname}${requestUrl.search}`, requestInit);
      res.status(upstream.status);

      upstream.headers.forEach((value, key) => {
        if (RESPONSE_BLOCKED_HEADERS.has(key.toLowerCase())) {
          return;
        }
        res.setHeader(key, value);
      });

      const payload = Buffer.from(await upstream.arrayBuffer());
      res.send(payload);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`No se pudo enrutar ${requestUrl.pathname} hacia ${GATEWAY_SERVICE_CONFIG[service].prefix}: ${reason}`);
      res.status(502).json({
        message: `No se pudo contactar el servicio ${service}`,
        reason,
      });
    }
  }

  private normalizeStringHeaders(rawHeaders?: HeadersInit) {
    if (!rawHeaders) {
      return {};
    }

    if (rawHeaders instanceof Headers) {
      return Object.fromEntries(rawHeaders.entries());
    }

    if (Array.isArray(rawHeaders)) {
      return Object.fromEntries(rawHeaders.map(([key, value]) => [key, String(value)]));
    }

    return Object.fromEntries(Object.entries(rawHeaders).map(([key, value]) => [key, String(value)]));
  }

  private extractForwardHeaders(headers: Record<string, unknown>) {
    const outgoing: Record<string, string> = {};

    Object.entries(headers || {}).forEach(([key, value]) => {
      if (typeof value === 'undefined' || REQUEST_BLOCKED_HEADERS.has(key.toLowerCase())) {
        return;
      }

      outgoing[key] = Array.isArray(value) ? value.join(', ') : String(value);
    });

    outgoing['accept-encoding'] = 'identity';
    return this.buildInternalHeaders(outgoing);
  }

  private async fetchServiceResponse(service: GatewayServiceKey, path: string, init?: RequestInit) {
    const errors: string[] = [];

    for (const [index, baseUrl] of this.serviceUrlCandidates[service].entries()) {
      const targetUrl = new URL(path, `${baseUrl}/`);

      try {
        const response = await fetch(targetUrl, init);
        if (index > 0) {
          this.logger.warn(`Fallback to ${baseUrl} for ${service}${path}`);
        }
        return response;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        errors.push(`${baseUrl}: ${reason}`);
      }
    }

    throw new Error(errors.join(' | ') || 'fetch failed');
  }

  private async readRequestBody(req: any) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      return req.body;
    }

    if (req.body && typeof req.body === 'object' && !this.isStreamLike(req.body)) {
      return JSON.stringify(req.body);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    if (!chunks.length) {
      return undefined;
    }

    return Buffer.concat(chunks);
  }

  private isStreamLike(value: unknown): value is NodeJS.ReadableStream {
    return Boolean(value) && typeof (value as NodeJS.ReadableStream).on === 'function' && typeof (value as NodeJS.ReadableStream).pipe === 'function';
  }
}