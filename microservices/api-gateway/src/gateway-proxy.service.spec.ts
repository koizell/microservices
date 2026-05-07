import { UnauthorizedException } from '@nestjs/common';
import { GatewayProxyService } from './gateway-proxy.service';

describe('GatewayProxyService', () => {
  let jwtService: any;
  let service: GatewayProxyService;
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    service = new GatewayProxyService(jwtService);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('verifyAuthorizationIfPresent', () => {
    it('returns silently when no authorization header is provided', () => {
      expect(() => service.verifyAuthorizationIfPresent(undefined)).not.toThrow();
      expect(() => service.verifyAuthorizationIfPresent('')).not.toThrow();
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when the authorization header does not start with Bearer', () => {
      expect(() => service.verifyAuthorizationIfPresent('Basic abc')).toThrow(UnauthorizedException);
      expect(() => service.verifyAuthorizationIfPresent('token-without-prefix')).toThrow(
        UnauthorizedException,
      );
      expect(jwtService.verify).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when JWT verification fails', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      expect(() => service.verifyAuthorizationIfPresent('Bearer abc.def.ghi')).toThrow(
        UnauthorizedException,
      );
    });

    it('uses JWT_SECRET from env when set, otherwise the dev secret', () => {
      process.env.JWT_SECRET = 'production-secret';
      service.verifyAuthorizationIfPresent('Bearer t1.t2.t3');
      expect(jwtService.verify).toHaveBeenCalledWith('t1.t2.t3', { secret: 'production-secret' });

      delete process.env.JWT_SECRET;
      service.verifyAuthorizationIfPresent('Bearer t1.t2.t3');
      expect(jwtService.verify).toHaveBeenLastCalledWith('t1.t2.t3', { secret: 'dev_only_change_me' });
    });

    it('passes the token without the "Bearer " prefix to JwtService', () => {
      service.verifyAuthorizationIfPresent('Bearer my-token');
      expect(jwtService.verify).toHaveBeenCalledWith('my-token', expect.any(Object));
    });
  });

  describe('buildInternalHeaders', () => {
    it('always tags requests with x-forwarded-by="api-gateway"', () => {
      const headers = service.buildInternalHeaders({ Accept: 'application/json' });
      expect(headers['x-forwarded-by']).toBe('api-gateway');
      expect(headers.Accept).toBe('application/json');
    });

    it('attaches x-internal-api-key only when INTERNAL_API_KEY is configured', () => {
      delete process.env.INTERNAL_API_KEY;
      expect(service.buildInternalHeaders({})['x-internal-api-key']).toBeUndefined();

      process.env.INTERNAL_API_KEY = 'secret-key-123';
      expect(service.buildInternalHeaders({})['x-internal-api-key']).toBe('secret-key-123');
    });

    it('trims whitespace from INTERNAL_API_KEY before attaching', () => {
      process.env.INTERNAL_API_KEY = '   ';
      expect(service.buildInternalHeaders({})['x-internal-api-key']).toBeUndefined();
    });
  });

  describe('safeFetch', () => {
    it('returns the fallback when the upstream returns non-ok status', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 } as any) as any;

      const result = await service.safeFetch('user', '/health', { defaulted: true });
      expect(result).toEqual({ defaulted: true });
    });

    it('returns the fallback when fetch throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

      const result = await service.safeFetch('user', '/health', { defaulted: true });
      expect(result).toEqual({ defaulted: true });
    });

    it('returns the upstream JSON body when the response is ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, count: 5 }),
      } as any) as any;

      const result = await service.safeFetch('user', '/users/summary', { count: 0 });
      expect(result).toEqual({ ok: true, count: 5 });
    });
  });

  describe('forwardRequest', () => {
    it('returns 404 with a structured message when the URL prefix is not a known service', async () => {
      const req = { url: '/unknown-service/something', headers: {}, method: 'GET' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), send: jest.fn() };

      await service.forwardRequest(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Ruta no soportada por el API Gateway' });
    });

    it('returns 404 when the URL has no path segments', async () => {
      const req = { url: '/', headers: {}, method: 'GET' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), send: jest.fn() };

      await service.forwardRequest(req as any, res as any);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('verifies authorization before routing — rejects an invalid token with Unauthorized', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt invalid');
      });

      const req = { url: '/users/me', headers: { authorization: 'Bearer abc' }, method: 'GET' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), send: jest.fn() };

      await expect(service.forwardRequest(req as any, res as any)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('returns 502 when no upstream candidate succeeds', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

      const req = { url: '/users/me', headers: {}, method: 'GET' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), send: jest.fn() };

      await service.forwardRequest(req as any, res as any);

      expect(res.status).toHaveBeenCalledWith(502);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('user') }),
      );
    });

    it('strips hop-by-hop response headers (transfer-encoding, content-encoding) before forwarding', async () => {
      const upstreamHeaders = new Map([
        ['content-type', 'application/json'],
        ['transfer-encoding', 'chunked'],
        ['content-encoding', 'gzip'],
        ['x-custom', 'pass-through'],
      ]);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { forEach: (cb: any) => upstreamHeaders.forEach((v, k) => cb(v, k)) },
        arrayBuffer: async () => Buffer.from('{"ok":true}'),
      } as any) as any;

      const req = { url: '/users/me', headers: {}, method: 'GET' };
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), send: jest.fn() };

      await service.forwardRequest(req as any, res as any);

      const forwardedHeaders = res.setHeader.mock.calls.map(([key]: any) => String(key).toLowerCase());
      expect(forwardedHeaders).toContain('content-type');
      expect(forwardedHeaders).toContain('x-custom');
      expect(forwardedHeaders).not.toContain('transfer-encoding');
      expect(forwardedHeaders).not.toContain('content-encoding');
    });
  });

  describe('urlFor', () => {
    it('builds an absolute URL by concatenating the service base url and the path', () => {
      const url = service.urlFor('user', '/users/me');
      expect(url).toMatch(/\/users\/me$/);
      expect(url).toMatch(/^https?:\/\//);
    });
  });
});
