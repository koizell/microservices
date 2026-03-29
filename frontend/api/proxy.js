const SERVICE_ENV_MAP = {
  gateway: 'GATEWAY_RENDER_URL',
  users: 'USER_SERVICE_RENDER_URL',
  events: 'EVENT_SERVICE_RENDER_URL',
  tickets: 'TICKETING_SERVICE_RENDER_URL',
  notifications: 'NOTIFICATION_SERVICE_RENDER_URL',
  credentials: 'CREDENTIAL_SERVICE_RENDER_URL',
  analytics: 'ANALYTICS_SERVICE_RENDER_URL',
  agenda: 'AGENDA_SERVICE_RENDER_URL',
  mobile: 'MOBILE_SERVICE_RENDER_URL',
};

const SERVICE_DEFAULT_URLS = {
  gateway: 'https://eventhive-api-gateway.onrender.com',
  users: 'https://eventhive-user-service.onrender.com',
  events: 'https://eventhive-event-service.onrender.com',
  tickets: 'https://eventhive-ticketing-service.onrender.com',
  notifications: 'https://eventhive-notification-service.onrender.com',
  credentials: 'https://eventhive-credential-service.onrender.com',
  analytics: 'https://eventhive-analytics-service.onrender.com',
  agenda: 'https://eventhive-agenda-service.onrender.com',
  mobile: 'https://eventhive-mobile-api-service.onrender.com',
};

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

const REQUEST_BLOCKED_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  'accept-encoding',
]);

const RESPONSE_BLOCKED_HEADERS = new Set([
  ...HOP_BY_HOP_HEADERS,
  'content-encoding',
  'etag',
]);

function normalizeBaseUrl(value) {
  const candidate = String(value || '')
    .trim()
    .replace(/\/+$/, '');

  if (!candidate) {
    return '';
  }

  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

function normalizePathSegments(rawPath) {
  if (Array.isArray(rawPath)) {
    return rawPath.flatMap((entry) => String(entry || '').split('/')).filter(Boolean);
  }

  return String(rawPath || '').split('/').filter(Boolean);
}

function buildTargetUrl(baseUrl, restPath, query) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const target = new URL(restPath.join('/'), normalizedBase);
  const searchParams = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (key === 'service' || key === 'path' || typeof value === 'undefined') {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
      return;
    }

    searchParams.append(key, value);
  });

  const queryString = searchParams.toString();
  if (queryString) {
    target.search = queryString;
  }

  return target;
}

function extractHeaders(headers) {
  const outgoing = {};

  Object.entries(headers || {}).forEach(([key, value]) => {
    if (typeof value === 'undefined' || REQUEST_BLOCKED_HEADERS.has(key.toLowerCase())) {
      return;
    }

    outgoing[key] = Array.isArray(value) ? value.join(', ') : value;
  });

  outgoing['accept-encoding'] = 'identity';

  return outgoing;
}

function isStreamLike(value) {
  return Boolean(value) && typeof value.on === 'function' && typeof value.pipe === 'function';
}

async function readRequestBody(req) {
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (req.body && typeof req.body === 'object' && !isStreamLike(req.body)) {
    return JSON.stringify(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  const serviceKey = String(req.query.service || '').trim();
  const restPath = normalizePathSegments(req.query.path);

  if (!serviceKey || !Object.prototype.hasOwnProperty.call(SERVICE_ENV_MAP, serviceKey)) {
    return res.status(404).json({ message: 'Ruta proxy no soportada' });
  }

  const envKey = SERVICE_ENV_MAP[serviceKey];
  const baseUrl = normalizeBaseUrl(process.env[envKey]) || SERVICE_DEFAULT_URLS[serviceKey];
  if (!baseUrl) {
    return res.status(500).json({
      message: `No se encontro URL para el servicio ${serviceKey}`,
    });
  }

  const targetUrl = buildTargetUrl(baseUrl, [serviceKey, ...restPath], req.query);
  const requestInit = {
    method: req.method,
    headers: extractHeaders(req.headers),
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    const body = await readRequestBody(req);
    if (typeof body !== 'undefined') {
      requestInit.body = body;
    }
  }

  try {
    const upstream = await fetch(targetUrl, requestInit);
    res.status(upstream.status);

    upstream.headers.forEach((value, key) => {
      if (RESPONSE_BLOCKED_HEADERS.has(key.toLowerCase())) {
        return;
      }

      res.setHeader(key, value);
    });

    const payload = Buffer.from(await upstream.arrayBuffer());
    return res.send(payload);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Error desconocido';
    return res.status(502).json({
      message: `No se pudo contactar el servicio ${serviceKey}`,
      reason,
    });
  }
};