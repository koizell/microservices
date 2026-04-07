import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CredentialService } from './credential.service';
import { Roles } from './decorators/roles.decorator';
import { RoleGuard } from './guards/role.guard';

@Controller('credentials')
export class CredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  private pageTemplate(title: string, subtitle: string, body: string, script = '', extraHead = '') {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  ${extraHead}
  <style>
    :root{--bg:#f6f7fb;--surface:#ffffff;--ink:#0f172a;--muted:#5b6475;--line:#dbe2ee;--brand:#1d4ed8;--brand2:#1e3a8a;--ok:#166534;--warn:#92400e;--err:#b91c1c;--info:#1d4ed8;--shadow:0 12px 28px rgba(15,23,42,.08)}
    *{box-sizing:border-box}
    body{margin:0;font-family:Manrope,Segoe UI,Tahoma,sans-serif;color:var(--ink);background:linear-gradient(160deg,#fff7d6 0,#f6f7fb 45%,#dbeafe 100%)}
    .wrap{max-width:1120px;margin:24px auto;padding:0 16px}
    .hero{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
    .hero h1{margin:0;font-size:34px;letter-spacing:-.03em}
    .hero p{margin:6px 0 0;color:var(--muted);max-width:760px}
    .grid{display:grid;gap:14px;margin-top:16px}
    .grid.two{grid-template-columns:1fr 1fr}
    .card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:var(--shadow)}
    h2,h3{margin:0 0 8px;letter-spacing:-.02em}
    p{margin:0 0 10px}
    .muted,.small{color:var(--muted)}
    .small{font-size:12px}
    .msg{display:block;margin-top:14px;padding:12px 14px;border-radius:12px;font-size:14px;border:1px solid transparent}
    .msg.ok{background:#ecfdf3;color:var(--ok);border-color:#bbf7d0}
    .msg.warn{background:#fef3c7;color:var(--warn);border-color:#fde68a}
    .msg.err{background:#fef2f2;color:var(--err);border-color:#fecaca}
    .msg.info{background:#eff6ff;color:var(--info);border-color:#bfdbfe}
    .actions{display:flex;gap:10px;flex-wrap:wrap}
    a.button,button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:10px 14px;border-radius:12px;border:0;background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}
    button.ghost,a.ghost{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe}
    input,textarea{width:100%;min-height:42px;padding:10px 12px;border-radius:12px;border:1px solid #c7d2e5;font:inherit}
    textarea{min-height:132px;resize:vertical}
    input:focus,textarea:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
    .list{display:grid;gap:10px;margin-top:10px}
    .item{border:1px solid var(--line);border-radius:14px;padding:12px;background:#f8fafc}
    .item strong{display:block;margin-bottom:4px}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800}
    .pill.valid{background:#dcfce7;color:#166534}
    .pill.used{background:#fee2e2;color:#991b1b}
    .pill.revoked{background:#e5e7eb;color:#374151}
    .pill.invalid{background:#fef3c7;color:#92400e}
    .qrBox{display:grid;place-items:center;min-height:260px;border:1px dashed #c7d2e5;border-radius:16px;background:#f8fafc}
    .mono{font-family:Consolas,monospace;word-break:break-all}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
    .meta div{padding:10px;border:1px solid var(--line);border-radius:12px;background:#f8fafc;font-size:13px}
    .api-list{display:grid;gap:8px;margin-top:10px}
    .api-list code{font-family:Consolas,monospace;background:#eef2ff;padding:2px 6px;border-radius:8px}
    @media(max-width:900px){.grid.two,.meta{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
    </div>
    ${body}
  </div>
  ${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderLandingUi() {
    return this.pageTemplate(
      'Credential Service',
      'Servicio de credenciales digitales basado en QR. El usuario consume su QR desde la vista cliente y el organizador valida en tiempo real desde la vista staff.',
      `<div class="grid two">
        <section class="card">
          <h3>Cliente</h3>
          <p class="muted">Consulta tus credenciales asociadas a tickets comprados, previsualiza el QR y descarga el PNG para mostrarlo en puerta.</p>
          <div class="actions">
            <a class="button" href="/credentials/client">Abrir mi QR</a>
          </div>
        </section>
        <section class="card">
          <h3>Staff / Organizador</h3>
          <p class="muted">Escanea el valor QR, valida el acceso contra backend y evita reutilización con check-in atómico.</p>
          <div class="actions">
            <a class="button" href="/credentials/staff">Abrir validación</a>
          </div>
        </section>
      </div>
      <section class="card" style="margin-top:16px">
        <h3>Endpoints clave</h3>
        <div class="api-list">
          <div><code>GET /credentials/me</code> devuelve solo las credenciales del usuario autenticado.</div>
          <div><code>POST /credentials/validate</code> valida el QR y marca el ticket como usado en tiempo real.</div>
          <div><code>POST /credentials/events/ticket-purchased</code> genera la credencial al cerrar la compra desde ticketing-service.</div>
          <div><code>GET /credentials/health</code> expone estado operativo y degradación de RabbitMQ.</div>
        </div>
      </section>`,
    );
  }

  @Get('client')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderClientUi() {
    const gatewayBaseUrl = String(process.env.GATEWAY_BASE_URL ?? process.env.GATEWAY_URL ?? 'http://localhost:3008')
      .trim()
      .replace(/\/+$/, '');

    return this.pageTemplate(
      'Mi Credencial',
      'Vista orientada al asistente: muestra el QR de acceso generado a partir de sus tickets comprados y permite descargarlo.',
      `<div id="status" class="msg info">Cargando tus credenciales...</div>
      <div class="grid two">
        <section class="card">
          <div class="actions" style="justify-content:space-between;align-items:center">
            <h3>Mis tickets con QR</h3>
            <button id="reloadBtn" class="ghost" type="button">Recargar</button>
          </div>
          <div id="credentialList" class="list"></div>
        </section>
        <section class="card">
          <h3>QR de acceso</h3>
          <div class="qrBox"><img id="qrImage" alt="QR de acceso" style="display:none;max-width:240px;width:100%;height:auto"><div id="qrPlaceholder" class="small">Selecciona una credencial para ver el QR.</div></div>
          <div id="previewLabel" class="small" style="margin-top:10px">Selecciona una credencial para ver el QR.</div>
          <div id="qrValue" class="mono small" style="margin-top:10px">Sin credencial seleccionada.</div>
          <div id="previewMeta" class="meta" style="margin-top:10px">
            <div>El detalle del ticket aparecerá aquí.</div>
            <div>El estado se actualiza en tiempo real al refrescar.</div>
          </div>
          <div class="actions" style="margin-top:12px">
            <button id="downloadBtn" class="ghost" type="button">Descargar PNG</button>
          </div>
        </section>
      </div>`,
      `
const gatewayBaseUrl = '${gatewayBaseUrl}';
function resolveApiUrl(path) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : '/' + String(path || '');
  const currentPort = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
  const isGatewayOrFrontendOrigin = currentPort === '3008' || currentPort === '3009';
  return isGatewayOrFrontendOrigin ? normalizedPath : gatewayBaseUrl + normalizedPath;
}
const dataApi = resolveApiUrl('/credentials/me');
const storageKeys = {
  token: 'eventhive.session.token',
  refreshToken: 'eventhive.session.refreshToken',
};
let token = localStorage.getItem(storageKeys.token) || '';
let refreshToken = localStorage.getItem(storageKeys.refreshToken) || '';
let credentials = [];
let selectedCredential = null;

function authHeaders(extra) {
  const headers = Object.assign({}, extra || {});
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }
  return headers;
}

function setStatus(message, type) {
  const el = document.getElementById('status');
  el.className = 'msg ' + (type || 'info');
  el.textContent = message;
}

function fmt(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function statusPill(status) {
  const normalized = String(status || 'INVALID').toLowerCase();
  const cls = normalized === 'valid' ? 'valid' : normalized === 'used' ? 'used' : normalized === 'revoked' ? 'revoked' : 'invalid';
  return '<span class="pill ' + cls + '">' + String(status || 'INVALID') + '</span>';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ticketDisplayName(credential) {
  return String(credential && (credential.ticketTypeName || credential.ticketTypeId || credential.ticketId) || 'Ticket sin nombre').trim();
}

function safeFileNamePart(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return normalized || 'ticket';
}

function persistSession(payload) {
  if (!payload) return;
  token = payload.token || token;
  refreshToken = payload.refreshToken || refreshToken;
  if (token) localStorage.setItem(storageKeys.token, token);
  if (refreshToken) localStorage.setItem(storageKeys.refreshToken, refreshToken);
}

function requestSessionFromContainer() {
  if (token) {
    return Promise.resolve();
  }

  return new Promise(function(resolve) {
    let settled = false;
    const finish = function() {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      resolve();
    };

    const onMessage = function(event) {
      if (!event.data || event.data.type !== 'eventhive:session') {
        return;
      }
      persistSession(event.data);
      finish();
    };

    window.addEventListener('message', onMessage);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'eventhive:request-session' }, '*');
      }
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'eventhive:request-session' }, '*');
      }
    } catch {}

    setTimeout(finish, 1200);
  });
}

async function readResponse(response) {
  const rawText = await response.text().catch(function(){ return ''; });
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return { message: rawText };
  }
}

async function renderQr(credential) {
  const imageEl = document.getElementById('qrImage');
  const placeholderEl = document.getElementById('qrPlaceholder');
  const valueEl = document.getElementById('qrValue');
  const labelEl = document.getElementById('previewLabel');
  const metaEl = document.getElementById('previewMeta');

  imageEl.style.display = 'none';
  imageEl.removeAttribute('src');
  placeholderEl.style.display = 'block';

  if (!credential) {
    selectedCredential = null;
    valueEl.textContent = 'Sin credencial seleccionada.';
    labelEl.textContent = 'Selecciona una credencial para ver el QR.';
    placeholderEl.textContent = 'Selecciona una credencial para ver el QR.';
    metaEl.innerHTML = '<div>El detalle del ticket aparecerá aquí.</div><div>El estado se actualiza en tiempo real al refrescar.</div>';
    return;
  }

  selectedCredential = credential;
  const displayName = ticketDisplayName(credential);
  valueEl.textContent = credential.qrCodeValue || 'Esta credencial no tiene QR persistido.';
  labelEl.innerHTML = statusPill(credential.status) + ' <span style="margin-left:8px">Ticket ' + escapeHtml(displayName) + '</span>';
  metaEl.innerHTML = [
    '<div><strong>Ticket</strong><br>' + escapeHtml(displayName) + '</div>',
    '<div><strong>Codigo</strong><br><span class="mono">' + escapeHtml(credential.ticketId || '-') + '</span></div>',
    '<div><strong>Creada</strong><br>' + fmt(credential.createdAt) + '</div>',
    '<div><strong>Ultimo uso</strong><br>' + fmt(credential.usedAt) + '</div>',
    '<div><strong>Scanner</strong><br>' + escapeHtml(credential.usedBy || '-') + '</div>',
    '<div><strong>Revocacion</strong><br>' + fmt(credential.revokedAt) + '</div>'
  ].join('');

  if (!credential.qrCodeDataUrl) {
    placeholderEl.textContent = 'No se pudo generar la imagen QR para esta credencial.';
    return;
  }

  imageEl.src = credential.qrCodeDataUrl;
  imageEl.style.display = 'block';
  placeholderEl.style.display = 'none';
}

function renderList() {
  const list = document.getElementById('credentialList');
  if (!credentials.length) {
    list.innerHTML = '<div class="item"><strong>Sin credenciales</strong><div class="muted">Compra un ticket para que credential-service genere automaticamente tu QR.</div></div>';
    return;
  }

  list.innerHTML = credentials.map(function(credential) {
    const displayName = ticketDisplayName(credential);
    return '<div class="item">' +
      '<strong>' + escapeHtml(displayName) + '</strong>' +
      '<div class="small">Codigo: <span class="mono">' + escapeHtml(credential.ticketId || '-') + '</span></div>' +
      '<div style="margin-top:8px">' + statusPill(credential.status) + '</div>' +
      '<div class="small" style="margin-top:8px">Generada: ' + fmt(credential.createdAt) + '</div>' +
      '<div class="actions" style="margin-top:10px"><button type="button" class="ghost" data-id="' + credential.id + '">Ver QR</button></div>' +
    '</div>';
  }).join('');

  Array.from(list.querySelectorAll('button[data-id]')).forEach(function(button) {
    button.addEventListener('click', async function() {
      const credential = credentials.find(function(item) { return item.id === button.getAttribute('data-id'); });
      await renderQr(credential || null);
    });
  });
}

async function load() {
  if (!token) {
    await requestSessionFromContainer();
  }

  if (!token) {
    credentials = [];
    renderList();
    await renderQr(null);
    setStatus('Inicia sesion desde el panel principal para cargar tus credenciales.', 'warn');
    return;
  }

  const response = await fetch(dataApi, { headers: authHeaders() });
  const payload = await readResponse(response);
  if (!response.ok) {
    credentials = [];
    renderList();
    await renderQr(null);
    setStatus(payload.message || 'No se pudieron cargar tus credenciales.', 'err');
    return;
  }

  credentials = Array.isArray(payload) ? payload : [];
  renderList();
  await renderQr(credentials[0] || null);
  setStatus(credentials.length ? 'Credenciales cargadas correctamente.' : 'Todavia no tienes credenciales emitidas.', credentials.length ? 'ok' : 'info');
}

document.getElementById('reloadBtn').onclick = function() {
  load();
};

document.getElementById('downloadBtn').onclick = function() {
  if (!selectedCredential || !selectedCredential.qrCodeDataUrl) {
    return;
  }
  const link = document.createElement('a');
  link.href = selectedCredential.qrCodeDataUrl;
  link.download = 'credential-' + safeFileNamePart(ticketDisplayName(selectedCredential)) + '.png';
  link.click();
};

window.addEventListener('message', function(event) {
  if (!event.data || event.data.type !== 'eventhive:session') {
    return;
  }
  persistSession(event.data);
  load();
});

load();
  `,
    );
  }

  @Get('staff')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderStaffUi() {
    return this.pageTemplate(
      'Validacion en Puerta',
      'Vista móvil para puerta: abre la cámara del celular, detecta el QR y muestra la información del acceso en tiempo real.',
      `<div id="status" class="msg info">Cargando sesion del organizador...</div>
      <section class="card scannerCard">
        <div class="scannerHeader">
          <div>
            <h3>Escaneo con camara</h3>
            <p class="muted">Apunta la camara del celular al QR. Cuando el codigo se detecte, se valida automaticamente y aqui mismo veras la informacion del ticket.</p>
          </div>
          <span id="scannerBadge" class="pill valid">Camara</span>
        </div>
        <div class="cameraShell">
          <div id="reader" class="reader">
            <div class="readerPlaceholder">
              <strong>Camara lista para escanear</strong>
              <div class="muted">Pulsa activar camara y apunta el QR dentro del marco.</div>
            </div>
          </div>
          <div class="scanFrame" aria-hidden="true"></div>
        </div>
        <div class="actions" style="margin-top:12px">
          <button id="startCameraBtn" type="button">Activar camara</button>
          <button id="scanAgainBtn" class="ghost" type="button" disabled>Escanear otro QR</button>
          <button id="reloadSessionBtn" class="ghost" type="button">Recargar sesion</button>
        </div>
        <div id="scannerMeta" class="small" style="margin-top:10px">Scanner: resolviendo...</div>
        <div class="divider"></div>
        <div>
          <h3>Informacion del acceso</h3>
          <div id="resultPanel" class="list">
            <div class="item">
              <strong>Esperando escaneo</strong>
              <div class="muted">En cuanto la camara lea un QR, aqui veras el estado, el ticket y el asistente.</div>
            </div>
          </div>
        </div>
      </section>`,
      `
const storageKeys = {
  token: 'eventhive.session.token',
  refreshToken: 'eventhive.session.refreshToken',
  scannerId: 'eventhive.staff.scannerId',
};
let token = localStorage.getItem(storageKeys.token) || '';
let refreshToken = localStorage.getItem(storageKeys.refreshToken) || '';
let scannerId = '';
let scannerContext = null;
let html5QrCode = null;
let cameraRunning = false;
let isValidating = false;
let lastScannedValue = '';
let lastScannedAt = 0;

const scannerConfig = {
  fps: 10,
  aspectRatio: 1,
  qrbox: function(viewfinderWidth, viewfinderHeight) {
    const edge = Math.max(180, Math.min(280, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72)));
    return { width: edge, height: edge };
  },
};

function persistSession(payload) {
  if (!payload) return;
  token = payload.token || token;
  refreshToken = payload.refreshToken || refreshToken;
  if (token) localStorage.setItem(storageKeys.token, token);
  if (refreshToken) localStorage.setItem(storageKeys.refreshToken, refreshToken);
}

function requestSessionFromContainer() {
  if (token) {
    return Promise.resolve();
  }

  return new Promise(function(resolve) {
    let settled = false;
    const finish = function() {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      resolve();
    };

    const onMessage = function(event) {
      if (!event.data || event.data.type !== 'eventhive:session') {
        return;
      }
      persistSession(event.data);
      finish();
    };

    window.addEventListener('message', onMessage);

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'eventhive:request-session' }, '*');
      }
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'eventhive:request-session' }, '*');
      }
    } catch {}

    setTimeout(finish, 1200);
  });
}

function setStatus(message, type) {
  const el = document.getElementById('status');
  el.className = 'msg ' + (type || 'info');
  el.textContent = message;
}

function setScannerBadge(text) {
  document.getElementById('scannerBadge').textContent = text;
}

function fmt(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setReaderPlaceholder(title, detail) {
  document.getElementById('reader').innerHTML = '<div class="readerPlaceholder">' +
    '<strong>' + escapeHtml(title) + '</strong>' +
    '<div class="muted">' + escapeHtml(detail) + '</div>' +
  '</div>';
}

function renderResult(payload, type, scannedValue) {
  const panel = document.getElementById('resultPanel');
  const status = String(payload.status || (payload.valid ? 'USED' : 'INVALID'));
  panel.innerHTML = '<div class="item">' +
    '<strong>' + status + '</strong>' +
    '<div class="small" style="margin-top:6px">Ticket: ' + (payload.ticketId || '-') + '</div>' +
    '<div class="small">Tipo: ' + (payload.ticketTypeName || payload.ticketTypeId || '-') + '</div>' +
    '<div class="small">Credencial: ' + (payload.credentialId || '-') + '</div>' +
    '<div class="small">Asistente: ' + (payload.attendeeName || '-') + '</div>' +
    '<div class="small">Scanner: ' + (payload.usedBy || scannerId || '-') + '</div>' +
    '<div class="small">Hora: ' + fmt(payload.checkinAt || payload.usedAt || payload.revokedAt) + '</div>' +
    '<div class="small">QR leido: ' + escapeHtml(scannedValue || '-') + '</div>' +
    '<div class="small" style="margin-top:6px;color:' + (type === 'ok' ? 'var(--ok)' : type === 'warn' ? 'var(--warn)' : 'var(--err)') + '">' + (payload.reason || (payload.valid ? 'Acceso permitido' : 'Acceso denegado')) + '</div>' +
  '</div>';
}

async function readResponse(response) {
  const rawText = await response.text().catch(function(){ return ''; });
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return { message: rawText };
  }
}

function createPreferredScannerId() {
  const params = new URLSearchParams(window.location.search);
  const queryScannerId = String(params.get('scannerId') || '').trim();
  if (queryScannerId) {
    localStorage.setItem(storageKeys.scannerId, queryScannerId);
    return queryScannerId;
  }

  const storedScannerId = String(localStorage.getItem(storageKeys.scannerId) || '').trim();
  if (storedScannerId) {
    return storedScannerId;
  }

  const generatedScannerId = 'gate-mobile-' + Math.random().toString(36).slice(2, 8);
  localStorage.setItem(storageKeys.scannerId, generatedScannerId);
  return generatedScannerId;
}

async function loadScannerContext() {
  if (!token) {
    return false;
  }

  const preferredScannerId = createPreferredScannerId();
  const response = await fetch('/credentials/staff/context?scannerId=' + encodeURIComponent(preferredScannerId), {
    headers: {
      Authorization: 'Bearer ' + token,
    },
  });
  const payload = await readResponse(response);

  if (!response.ok) {
    setStatus(payload.message || 'No se pudo resolver el scanner de la puerta.', 'err');
    return false;
  }

  scannerContext = payload;
  scannerId = String(payload.scannerId || preferredScannerId || '').trim();
  if (scannerId) {
    localStorage.setItem(storageKeys.scannerId, scannerId);
  }

  let scannerMessage = 'Scanner: ' + (scannerId || '-');
  scannerMessage += payload.scannersRestricted ? ' • validado contra SCANNER_IDS' : ' • asignado a este dispositivo';
  if (payload.overridden) {
    scannerMessage += ' • se aplico un scanner permitido automaticamente';
  }
  document.getElementById('scannerMeta').textContent = scannerMessage;
  return Boolean(scannerId);
}

async function destroyScanner() {
  const currentScanner = html5QrCode;
  html5QrCode = null;

  if (currentScanner) {
    try {
      if (cameraRunning) {
        await currentScanner.stop();
      }
    } catch {}

    try {
      await currentScanner.clear();
    } catch {}
  }

  cameraRunning = false;
}

async function startWithPreferredCamera(scanner) {
  try {
    await scanner.start({ facingMode: { exact: 'environment' } }, scannerConfig, onScanSuccess);
    return;
  } catch {}

  try {
    await scanner.start({ facingMode: 'environment' }, scannerConfig, onScanSuccess);
    return;
  } catch {}

  const cameras = await Html5Qrcode.getCameras().catch(function() {
    return [];
  });

  if (!Array.isArray(cameras) || cameras.length === 0) {
    throw new Error('No se encontro una camara disponible');
  }

  await scanner.start(cameras[0].id, scannerConfig, onScanSuccess);
}

async function startCamera() {
  if (cameraRunning || isValidating) {
    return;
  }

  if (!token) {
    await requestSessionFromContainer();
  }

  if (!token) {
    setStatus('Inicia sesion como organizador para validar accesos.', 'warn');
    return;
  }

  const scannerReady = await loadScannerContext();
  if (!scannerReady) {
    setStatus('No se pudo preparar el scanner de puerta.', 'err');
    return;
  }

  document.getElementById('startCameraBtn').disabled = true;
  document.getElementById('scanAgainBtn').disabled = true;
  setScannerBadge('Activando');
  setStatus('Solicitando acceso a la camara...', 'info');
  document.getElementById('reader').innerHTML = '';

  const scanner = new Html5Qrcode('reader');
  html5QrCode = scanner;

  try {
    await startWithPreferredCamera(scanner);
    cameraRunning = true;
    setScannerBadge('Escaneando');
    setStatus('Camara activa. Apunta el QR dentro del marco.', 'ok');
  } catch (error) {
    await destroyScanner();
    document.getElementById('startCameraBtn').disabled = false;
    setScannerBadge('Camara');
    setReaderPlaceholder('No se pudo abrir la camara', 'Revisa los permisos de camara o usa un navegador movil compatible.');
    setStatus(error instanceof Error ? error.message : 'No se pudo abrir la camara del dispositivo.', 'err');
  }
}

async function validateScannedQr(qrCodeHash) {
  if (!scannerId) {
    const scannerReady = await loadScannerContext();
    if (!scannerReady) {
      setStatus('No se pudo resolver el scanner para validar el acceso.', 'err');
      return;
    }
  }

  const response = await fetch('/credentials/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({ qrCodeHash, scannerId }),
  });
  const payload = await readResponse(response);

  if (!response.ok || payload.valid === false) {
    const type = payload.status === 'USED' || payload.status === 'REVOKED' ? 'warn' : 'err';
    setStatus((payload.status || 'INVALID') + ': ' + (payload.reason || payload.message || 'No se pudo validar el ticket.'), type);
    renderResult(payload, type, qrCodeHash);
    return;
  }

  setStatus('Acceso permitido. El ticket ya quedó marcado como usado.', 'ok');
  renderResult(payload, 'ok', qrCodeHash);
}

async function onScanSuccess(decodedText) {
  const qrCodeHash = String(decodedText || '').trim();
  if (!qrCodeHash || isValidating) {
    return;
  }

  const now = Date.now();
  if (qrCodeHash === lastScannedValue && now - lastScannedAt < 2500) {
    return;
  }

  lastScannedValue = qrCodeHash;
  lastScannedAt = now;
  isValidating = true;
  setScannerBadge('Validando');
  setStatus('QR detectado. Validando acceso...', 'info');
  await destroyScanner();
  setReaderPlaceholder('QR detectado', 'La validacion ya se realizo. Usa el boton para escanear otro acceso.');
  await validateScannedQr(qrCodeHash);
  isValidating = false;
  document.getElementById('startCameraBtn').disabled = false;
  document.getElementById('scanAgainBtn').disabled = false;
  setScannerBadge('Listo');
}

document.getElementById('startCameraBtn').onclick = function() {
  startCamera();
};

document.getElementById('scanAgainBtn').onclick = function() {
  setReaderPlaceholder('Preparando nuevo escaneo', 'La camara se volvera a activar para leer otro QR.');
  startCamera();
};

document.getElementById('reloadSessionBtn').onclick = function() {
  requestSessionFromContainer().then(function() {
    if (!token) {
      setStatus('No se encontro sesion activa.', 'warn');
      return;
    }

    loadScannerContext().then(function() {
      setStatus('Sesion del organizador cargada.', 'ok');
    });
  });
};

window.addEventListener('message', function(event) {
  if (!event.data || event.data.type !== 'eventhive:session') {
    return;
  }
  persistSession(event.data);
  loadScannerContext().then(function() {
    setStatus('Sesion del organizador cargada.', 'ok');
  });
});

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') {
    destroyScanner();
  }
});

window.addEventListener('beforeunload', function() {
  destroyScanner();
});

requestSessionFromContainer().then(function() {
  if (!token) {
    setStatus('Abre esta vista desde el panel principal con una cuenta admin.', 'warn');
    setReaderPlaceholder('Sesion requerida', 'Debes abrir esta vista con una sesion de organizador para activar la camara.');
    return;
  }

  loadScannerContext().then(function() {
    setStatus('Sesion lista. Si el navegador lo permite, la camara se abrira automaticamente.', 'ok');
    startCamera();
  });
});
      `,
      `<script src="/credentials/assets/html5-qrcode.min.js"></script>
      <style>
        .scannerCard{display:grid;gap:16px}
        .scannerHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
        .cameraShell{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:20px;background:linear-gradient(180deg,#eff6ff,#dbeafe);min-height:320px}
        .reader{min-height:320px;display:grid;place-items:center}
        .reader video{width:100%;height:100%;min-height:320px;object-fit:cover;display:block}
        .readerPlaceholder{display:grid;gap:6px;place-items:center;text-align:center;padding:28px}
        .scanFrame{position:absolute;inset:50% auto auto 50%;width:min(68vw,250px);height:min(68vw,250px);transform:translate(-50%,-50%);border:3px solid rgba(255,255,255,.92);border-radius:26px;box-shadow:0 0 0 999px rgba(15,23,42,.18);pointer-events:none}
        .divider{height:1px;background:var(--line)}
        #reader__dashboard_section_csr,#reader__dashboard_section_swaplink,#reader__scan_region img{display:none !important}
        #reader__dashboard{display:none !important}
        @media(max-width:700px){.cameraShell,.reader,.reader video{min-height:420px}.scanFrame{width:min(72vw,280px);height:min(72vw,280px)}}
      </style>`,
    );
  }

  @Get('assets/html5-qrcode.min.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=86400')
  renderHtml5QrCodeAsset() {
    return readFileSync(join(process.cwd(), 'node_modules', 'html5-qrcode', 'html5-qrcode.min.js'), 'utf8');
  }

  @Get('staff/context')
  @UseGuards(RoleGuard)
  @Roles('admin')
  getStaffContext(@Query('scannerId') scannerId?: string) {
    return this.credentialService.getStaffScannerContext(scannerId);
  }

  @Get('health')
  async status() {
    return await this.credentialService.getOperationalStatus();
  }

  @Get('me')
  @UseGuards(RoleGuard)
  @Roles('standard', 'admin')
  async myCredentials(@Headers('authorization') authorization?: string) {
    return await this.credentialService.getCredentialsForAuthorization(authorization ?? '');
  }

  @Post('from-ticket')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async createFromTicket(
    @Body() body: { orderItemId: string; ticketTypeId: string; attendeeName: string },
  ) {
    return await this.credentialService.createFromPurchase(body);
  }

  @Post('events/ticket-purchased')
  async ingestPurchaseEvent(
    @Headers('x-forwarded-by') forwardedBy: string | undefined,
    @Body() body: { orderItemId?: string; ticketTypeId?: string; attendeeName?: string },
  ) {
    if (String(forwardedBy ?? '').trim().toLowerCase() !== 'ticketing-service') {
      throw new ForbiddenException('Solo ticketing-service puede generar credenciales via evento');
    }

    return await this.credentialService.ingestPurchaseEvent(body);
  }

  @Post('validate')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async validate(@Body() body: { qrCodeHash: string; scannerId: string }) {
    return await this.credentialService.validateQr(body.qrCodeHash, body.scannerId);
  }

  @Post('revoke/:id')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async revoke(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { revokedBy?: string; reason?: string },
  ) {
    return await this.credentialService.revokeCredential(id, body.revokedBy ?? 'admin-panel', body.reason);
  }

  @Get('summary')
  async summary() {
    return { total: await this.credentialService.countAll() };
  }

  @Post('repair-legacy')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async repairLegacy(@Query('limit') limit?: string) {
    return await this.credentialService.repairLegacyCredentials(Number(limit ?? 50));
  }

  @Get('data')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async findAll(@Query('limit') limit?: string) {
    return await this.credentialService.findAll(Number(limit ?? 50));
  }

  @Get(':id')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.credentialService.getCredentialById(id);
  }
}
