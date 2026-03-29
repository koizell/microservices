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

function normalizeBaseUrl(value) {
  const candidate = String(value || '')
    .trim()
    .replace(/\/+$/, '');

  if (!candidate) {
    return '';
  }

  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

function buildTargetUrl(baseUrl, restPath, query) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const target = new URL(restPath.join('/'), normalizedBase);
  const searchParams = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (key === 'path' || typeof value === 'undefined') {
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
    if (typeof value === 'undefined' || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }

    outgoing[key] = Array.isArray(value) ? value.join(', ') : value;
  });

  return outgoing;
}

module.exports = async function handler(req, res) {
  const pathParts = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  const [serviceKey, ...restPath] = pathParts;
  if (!serviceKey || !Object.prototype.hasOwnProperty.call(SERVICE_ENV_MAP, serviceKey)) {
    return res.status(404).json({ message: 'Ruta proxy no soportada' });
  }

  const envKey = SERVICE_ENV_MAP[serviceKey];
  const baseUrl = normalizeBaseUrl(process.env[envKey]);
  if (!baseUrl) {
    return res.status(500).json({
      message: `Falta configurar ${envKey} en Vercel`,
    });
  }

  const targetUrl = buildTargetUrl(baseUrl, restPath, req.query);
  const requestInit = {
    method: req.method,
    headers: extractHeaders(req.headers),
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(req.method || 'GET') && typeof req.body !== 'undefined') {
    requestInit.body = typeof req.body === 'string' || Buffer.isBuffer(req.body)
      ? req.body
      : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(targetUrl, requestInit);
    res.status(upstream.status);

    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
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