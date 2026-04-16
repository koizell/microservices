export type GatewayServiceKey =
  | 'user'
  | 'event'
  | 'ticketing'
  | 'notification'
  | 'credential'
  | 'analytics'
  | 'agenda'
  | 'mobile';

type GatewayServiceConfig = {
  prefix: string;
  envKey: string;
  fallback: string;
  publicFallback: string;
};

export const GATEWAY_SERVICE_CONFIG: Record<GatewayServiceKey, GatewayServiceConfig> = {
  user: {
    prefix: 'users',
    envKey: 'USER_SERVICE_URL',
    fallback: 'http://localhost:3000',
    publicFallback: 'https://eventhive-user-service.onrender.com',
  },
  event: {
    prefix: 'events',
    envKey: 'EVENT_SERVICE_URL',
    fallback: 'http://localhost:3001',
    publicFallback: 'https://eventhive-event-service.onrender.com',
  },
  ticketing: {
    prefix: 'tickets',
    envKey: 'TICKETING_SERVICE_URL',
    fallback: 'http://localhost:3002',
    publicFallback: 'https://eventhive-ticketing-service.onrender.com',
  },
  notification: {
    prefix: 'notifications',
    envKey: 'NOTIFICATION_SERVICE_URL',
    fallback: 'http://localhost:3003',
    publicFallback: 'https://eventhive-notification-service.onrender.com',
  },
  credential: {
    prefix: 'credentials',
    envKey: 'CREDENTIAL_SERVICE_URL',
    fallback: 'http://localhost:3004',
    publicFallback: 'https://eventhive-credential-service.onrender.com',
  },
  analytics: {
    prefix: 'analytics',
    envKey: 'ANALYTICS_SERVICE_URL',
    fallback: 'http://localhost:3006',
    publicFallback: 'https://eventhive-analytics-service.onrender.com',
  },
  agenda: {
    prefix: 'agenda',
    envKey: 'AGENDA_SERVICE_URL',
    fallback: 'http://localhost:3005',
    publicFallback: 'https://eventhive-agenda-service.onrender.com',
  },
  mobile: {
    prefix: 'mobile',
    envKey: 'MOBILE_SERVICE_URL',
    fallback: 'http://localhost:3007',
    publicFallback: 'https://eventhive-mobile-api-service.onrender.com',
  },
};

export const GATEWAY_PROXY_PREFIXES = Object.values(GATEWAY_SERVICE_CONFIG).map((config) => config.prefix);

export const GATEWAY_PREFIX_TO_SERVICE = Object.fromEntries(
  Object.entries(GATEWAY_SERVICE_CONFIG).map(([serviceKey, config]) => [config.prefix, serviceKey]),
) as Record<string, GatewayServiceKey>;

export function normalizeServiceBaseUrl(value: string | undefined, fallback: string) {
  const candidate = String(value ?? fallback)
    .trim()
    .replace(/\/+$/, '');

  if (!candidate) {
    return fallback;
  }

  return /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
}

export function buildServiceBaseUrlCandidates(value: string | undefined, fallback: string, publicFallback: string) {
  const rawCandidate = String(value ?? '')
    .trim()
    .replace(/\/+$/, '');
  const candidates = new Set<string>();
  const shouldAllowPublicFallback = String(
    process.env.GATEWAY_ALLOW_PUBLIC_FALLBACK ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false'),
  )
    .trim()
    .toLowerCase() === 'true';

  if (rawCandidate) {
    candidates.add(normalizeServiceBaseUrl(rawCandidate, fallback));

    if (shouldAllowPublicFallback && !/^https?:\/\//i.test(rawCandidate)) {
      const host = rawCandidate.split(':')[0]?.trim();
      if (host && /^eventhive-[a-z0-9-]+$/i.test(host)) {
        candidates.add(`https://${host}.onrender.com`);
      }
    }
  }

  candidates.add(normalizeServiceBaseUrl(undefined, fallback));
  if (shouldAllowPublicFallback) {
    candidates.add(normalizeServiceBaseUrl(publicFallback, fallback));
  }
  return [...candidates];
}

export function resolveGatewayServiceUrls() {
  return Object.fromEntries(
    Object.entries(GATEWAY_SERVICE_CONFIG).map(([serviceKey, config]) => [
      serviceKey,
      normalizeServiceBaseUrl(process.env[config.envKey], config.fallback),
    ]),
  ) as Record<GatewayServiceKey, string>;
}

export function resolveGatewayServiceUrlCandidates() {
  return Object.fromEntries(
    Object.entries(GATEWAY_SERVICE_CONFIG).map(([serviceKey, config]) => [
      serviceKey,
      buildServiceBaseUrlCandidates(process.env[config.envKey], config.fallback, config.publicFallback),
    ]),
  ) as Record<GatewayServiceKey, string[]>;
}