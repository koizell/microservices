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
};

export const GATEWAY_SERVICE_CONFIG: Record<GatewayServiceKey, GatewayServiceConfig> = {
  user: { prefix: 'users', envKey: 'USER_SERVICE_URL', fallback: 'http://localhost:3000' },
  event: { prefix: 'events', envKey: 'EVENT_SERVICE_URL', fallback: 'http://localhost:3001' },
  ticketing: { prefix: 'tickets', envKey: 'TICKETING_SERVICE_URL', fallback: 'http://localhost:3002' },
  notification: { prefix: 'notifications', envKey: 'NOTIFICATION_SERVICE_URL', fallback: 'http://localhost:3003' },
  credential: { prefix: 'credentials', envKey: 'CREDENTIAL_SERVICE_URL', fallback: 'http://localhost:3004' },
  analytics: { prefix: 'analytics', envKey: 'ANALYTICS_SERVICE_URL', fallback: 'http://localhost:3006' },
  agenda: { prefix: 'agenda', envKey: 'AGENDA_SERVICE_URL', fallback: 'http://localhost:3005' },
  mobile: { prefix: 'mobile', envKey: 'MOBILE_SERVICE_URL', fallback: 'http://localhost:3007' },
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

export function resolveGatewayServiceUrls() {
  return Object.fromEntries(
    Object.entries(GATEWAY_SERVICE_CONFIG).map(([serviceKey, config]) => [
      serviceKey,
      normalizeServiceBaseUrl(process.env[config.envKey], config.fallback),
    ]),
  ) as Record<GatewayServiceKey, string>;
}