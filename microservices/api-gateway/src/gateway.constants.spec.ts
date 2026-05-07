import {
  buildServiceBaseUrlCandidates,
  GATEWAY_PREFIX_TO_SERVICE,
  normalizeServiceBaseUrl,
} from './gateway.constants';

describe('gateway.constants', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('normalizeServiceBaseUrl', () => {
    it('returns the configured value when valid http(s) URL', () => {
      expect(normalizeServiceBaseUrl('https://api.example.com', 'http://localhost:3000')).toBe(
        'https://api.example.com',
      );
    });

    it('strips trailing slashes', () => {
      expect(normalizeServiceBaseUrl('https://api.example.com///', 'http://localhost:3000')).toBe(
        'https://api.example.com',
      );
    });

    it('prepends http:// when scheme is missing', () => {
      expect(normalizeServiceBaseUrl('internal-host:3000', 'http://localhost:3000')).toBe(
        'http://internal-host:3000',
      );
    });

    it('falls back when value is empty/undefined/whitespace', () => {
      expect(normalizeServiceBaseUrl(undefined, 'http://localhost:3000')).toBe('http://localhost:3000');
      expect(normalizeServiceBaseUrl('', 'http://localhost:3000')).toBe('http://localhost:3000');
      expect(normalizeServiceBaseUrl('   ', 'http://localhost:3000')).toBe('http://localhost:3000');
    });
  });

  describe('buildServiceBaseUrlCandidates', () => {
    it('returns only local fallback when no value and not in production mode', () => {
      delete process.env.GATEWAY_ALLOW_PUBLIC_FALLBACK;
      delete process.env.NODE_ENV;

      const candidates = buildServiceBaseUrlCandidates(
        undefined,
        'http://localhost:3000',
        'https://eventhive-user-service.onrender.com',
      );

      expect(candidates).toEqual(['http://localhost:3000']);
    });

    it('appends the public fallback when GATEWAY_ALLOW_PUBLIC_FALLBACK=true', () => {
      process.env.GATEWAY_ALLOW_PUBLIC_FALLBACK = 'true';

      const candidates = buildServiceBaseUrlCandidates(
        undefined,
        'http://localhost:3000',
        'https://eventhive-user-service.onrender.com',
      );

      expect(candidates).toContain('http://localhost:3000');
      expect(candidates).toContain('https://eventhive-user-service.onrender.com');
    });

    it('appends the public fallback automatically when NODE_ENV=production', () => {
      delete process.env.GATEWAY_ALLOW_PUBLIC_FALLBACK;
      process.env.NODE_ENV = 'production';

      const candidates = buildServiceBaseUrlCandidates(
        undefined,
        'http://localhost:3000',
        'https://eventhive-user-service.onrender.com',
      );

      expect(candidates).toContain('https://eventhive-user-service.onrender.com');
    });

    it('expands a hostname like "eventhive-user-service" into its render.com URL when public fallback is allowed', () => {
      process.env.GATEWAY_ALLOW_PUBLIC_FALLBACK = 'true';

      const candidates = buildServiceBaseUrlCandidates(
        'eventhive-user-service',
        'http://localhost:3000',
        'https://eventhive-user-service.onrender.com',
      );

      expect(candidates).toContain('https://eventhive-user-service.onrender.com');
    });

    it('does NOT expand the hostname when public fallback is disabled', () => {
      delete process.env.GATEWAY_ALLOW_PUBLIC_FALLBACK;
      process.env.NODE_ENV = 'development';

      const candidates = buildServiceBaseUrlCandidates(
        'eventhive-user-service',
        'http://localhost:3000',
        'https://eventhive-user-service.onrender.com',
      );

      expect(candidates).not.toContain('https://eventhive-user-service.onrender.com');
    });

    it('always includes the explicit configured value as the first candidate', () => {
      const candidates = buildServiceBaseUrlCandidates(
        'http://my-internal:8080',
        'http://localhost:3000',
        'https://eventhive-user-service.onrender.com',
      );

      expect(candidates[0]).toBe('http://my-internal:8080');
    });

    it('deduplicates candidates when configured matches the local fallback', () => {
      const candidates = buildServiceBaseUrlCandidates(
        'http://localhost:3000',
        'http://localhost:3000',
        'https://eventhive-user-service.onrender.com',
      );

      expect(candidates.filter((c) => c === 'http://localhost:3000')).toHaveLength(1);
    });
  });

  describe('GATEWAY_PREFIX_TO_SERVICE', () => {
    it('routes the canonical prefixes to the correct service keys', () => {
      expect(GATEWAY_PREFIX_TO_SERVICE.users).toBe('user');
      expect(GATEWAY_PREFIX_TO_SERVICE.events).toBe('event');
      expect(GATEWAY_PREFIX_TO_SERVICE.tickets).toBe('ticketing');
      expect(GATEWAY_PREFIX_TO_SERVICE.notifications).toBe('notification');
      expect(GATEWAY_PREFIX_TO_SERVICE.credentials).toBe('credential');
      expect(GATEWAY_PREFIX_TO_SERVICE.analytics).toBe('analytics');
      expect(GATEWAY_PREFIX_TO_SERVICE.agenda).toBe('agenda');
      expect(GATEWAY_PREFIX_TO_SERVICE.mobile).toBe('mobile');
    });

    it('returns undefined for unknown prefixes', () => {
      expect(GATEWAY_PREFIX_TO_SERVICE['admin']).toBeUndefined();
    });
  });
});
