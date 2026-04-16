const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname);
require("dotenv").config({ path: path.join(root, ".env") });

const indexFilePath = path.join(root, "views", "index.html");
const port = Number(process.env.PORT || 3009);
const gatewayBaseUrl = normalizeBaseUrl(
  process.env.GATEWAY_BASE_URL || process.env.GATEWAY_URL || "http://localhost:3008",
  "http",
);
const proxyPrefixes = [
  "/gateway",
  "/users",
  "/events",
  "/tickets",
  "/notifications",
  "/credentials",
  "/analytics",
  "/agenda",
  "/mobile",
];
const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const blockedResponseHeaders = new Set([...hopByHopHeaders, "content-encoding", "etag"]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function normalizeBaseUrl(value, defaultProtocol) {
  return String(value || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/^(?!https?:\/\/)/i, function (candidate) {
      return candidate ? `${defaultProtocol || "http"}://` : "";
    });
}

function isProxyRequest(requestPath) {
  return proxyPrefixes.some(function (prefix) {
    return requestPath === prefix || requestPath.startsWith(prefix + "/");
  });
}

function buildProxyUrl(request) {
  return new URL(request.url || "/", gatewayBaseUrl);
}

function extractProxyHeaders(headers) {
  const outgoing = {};

  Object.entries(headers || {}).forEach(function ([key, value]) {
    if (typeof value === "undefined" || hopByHopHeaders.has(String(key).toLowerCase())) {
      return;
    }

    outgoing[key] = Array.isArray(value) ? value.join(", ") : String(value);
  });

  outgoing["accept-encoding"] = "identity";
  outgoing["x-forwarded-by"] = "frontend-shell";
  return outgoing;
}

async function readRequestBody(request) {
  if (["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) {
    return undefined;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) {
    return undefined;
  }

  return Buffer.concat(chunks);
}

async function sendUpstreamResponse(response, upstream) {
  response.statusCode = upstream.status;

  upstream.headers.forEach(function (value, key) {
    if (blockedResponseHeaders.has(String(key).toLowerCase())) {
      return;
    }
    response.setHeader(key, value);
  });

  response.end(Buffer.from(await upstream.arrayBuffer()));
}

async function proxyRequest(request, response) {
  try {
    const upstream = await fetch(buildProxyUrl(request), {
      method: request.method,
      headers: extractProxyHeaders(request.headers),
      body: await readRequestBody(request),
      redirect: "manual",
    });

    await sendUpstreamResponse(response, upstream);
  } catch (error) {
    response.statusCode = 502;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({
        message: "No se pudo contactar el API Gateway local. Inicia microservices/api-gateway en localhost:3008 y, para login, tambien microservices/user-service en localhost:3000.",
        reason: error instanceof Error ? error.message : "Error desconocido",
      }),
    );
  }
}

function isInsideRoot(targetPath) {
  const relative = path.relative(root, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeResolve(requestPath) {
  const normalized = requestPath === "/" ? "/views/index.html" : requestPath;
  const target = path.resolve(root, `.${normalized}`);
  return isInsideRoot(target) ? target : null;
}

function sendFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.statusCode = 500;
      response.end("Internal Server Error");
      return;
    }

    response.setHeader("Content-Type", mimeTypes[path.extname(filePath).toLowerCase()] || "text/plain; charset=utf-8");
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || "/").split("?")[0]);

  if (isProxyRequest(requestPath)) {
    proxyRequest(request, response);
    return;
  }

  const filePath = safeResolve(requestPath);

  if (!filePath) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(response, filePath);
      return;
    }

    sendFile(response, indexFilePath);
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Frontend listo en http://localhost:${port} -> ${gatewayBaseUrl}`);
});