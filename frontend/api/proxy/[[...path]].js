const SUPPORTED_PUBLIC_PREFIXES = new Set([
  'gateway',
  'users',
  'events',
  'tickets',
  'notifications',
  'credentials',
  'analytics',
  'agenda',
  'mobile',
]);

const GATEWAY_DEFAULT_URL = 'https://eventhive-api-gateway.onrender.com';

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
    if (typeof value === 'undefined' || REQUEST_BLOCKED_HEADERS.has(key.toLowerCase())) {
      return;
    }

    outgoing[key] = Array.isArray(value) ? value.join(', ') : value;
  });

  outgoing['accept-encoding'] = 'identity';

  return outgoing;
}

module.exports = async function handler(req, res) {
  const pathParts = Array.isArray(req.query.path)
    ? req.query.path
    : req.query.path
      ? [req.query.path]
      : [];

  const [serviceKey, ...restPath] = pathParts;
  if (!serviceKey || !SUPPORTED_PUBLIC_PREFIXES.has(serviceKey)) {
    return res.status(404).json({ message: 'Ruta proxy no soportada' });
  }

  const baseUrl = normalizeBaseUrl(process.env.GATEWAY_RENDER_URL) || GATEWAY_DEFAULT_URL;
  if (!baseUrl) {
    return res.status(500).json({
      message: 'No se encontro URL para el API Gateway',
    });
  }

  const targetUrl = buildTargetUrl(baseUrl, [serviceKey, ...restPath], req.query);
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