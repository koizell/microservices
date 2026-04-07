import { BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { RoleGuard } from './guards/role.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Get('health')
  status() {
    return { service: 'ticketing-service', status: 'ok' };
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi() {
    return this.renderUiByRole('auto');
  }

  @Get('client')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderClientUi() {
    return this.renderUiByRole('standard');
  }

  @Get('organizer')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderOrganizerUi() {
    return this.renderUiByRole('admin');
  }

  @Get('staff')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderStaffUi() {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ticketing Staff Check-in</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--ink:#0f172a;--line:#dbe2ee;--ok:#166534;--err:#b91c1c;--brand:#1d4ed8;--brand2:#1e3a8a}
    *{box-sizing:border-box}
    body{margin:0;font-family:Manrope,system-ui,sans-serif;color:var(--ink);background:linear-gradient(160deg,#fef3c7 0,#f8fafc 45%,#dbeafe 100%)}
    .wrap{max-width:880px;margin:22px auto;padding:0 14px}
    .card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:0 10px 22px rgba(15,23,42,.06)}
    h1{margin:0;font-size:30px;letter-spacing:-.02em}
    p{color:#5b6475}
    .row{display:grid;grid-template-columns:1fr 1fr auto;gap:10px}
    input,button{min-height:42px;padding:10px 12px;border-radius:10px;border:1px solid #c7d2e5;font:inherit}
    input:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
    button{border:0;background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;font-weight:800;cursor:pointer}
    .msg{margin-top:10px;padding:10px 12px;border-radius:10px;display:none}
    .msg.ok{display:block;background:#ecfdf3;color:var(--ok);border:1px solid #bbf7d0}
    .msg.err{display:block;background:#fef2f2;color:var(--err);border:1px solid #fecaca}
    .links{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap}
    .links a{font-weight:700;color:#1e3a8a;text-decoration:none}
    @media(max-width:800px){.row{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>Staff Check-in</h1>
      <p>Interfaz de validacion para personal de acceso. Esta vista usa credential-service para validar QR.</p>
      <div class="row">
        <input id="qrCodeHash" placeholder="qrCodeHash">
        <input id="scannerId" placeholder="scannerId (ej. gate-A1)">
        <button onclick="validateQr()">Validar entrada</button>
      </div>
      <div id="msg" class="msg"></div>
      <div class="links">
        <a href="/tickets/client">Ir a interfaz cliente</a>
        <a href="/tickets/organizer">Ir a interfaz organizador</a>
        <a id="credentialConsoleLink" href="/credentials" target="_blank" rel="noreferrer">Abrir credential-service</a>
      </div>
    </section>
  </div>

  <script>
    const credentialHost = window.location.hostname || 'localhost';
    const credentialPort = window.location.port || '';
    const credentialIsLocal = credentialHost === 'localhost' || credentialHost === '127.0.0.1';
    const credentialBaseUrl = credentialIsLocal && credentialPort && credentialPort !== '3008'
      ? ('http://' + credentialHost + ':3008')
      : window.location.origin;
    let token = localStorage.getItem('eventhive.session.token') || '';
    document.getElementById('credentialConsoleLink').href = credentialBaseUrl + '/credentials/staff';

    function persistSession(payload) {
      if (!payload || !payload.token) {
        return;
      }
      token = payload.token;
      localStorage.setItem('eventhive.session.token', token);
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

    function setMsg(message, type) {
      const el = document.getElementById('msg');
      el.className = message ? ('msg ' + type) : 'msg';
      el.textContent = message || '';
    }

    async function validateQr() {
      const qrCodeHash = document.getElementById('qrCodeHash').value.trim();
      const scannerId = document.getElementById('scannerId').value.trim() || 'gate-A1';
      if (!qrCodeHash) {
        setMsg('Debes capturar el hash QR.', 'err');
        return;
      }

      if (!token) {
        await requestSessionFromContainer();
      }

      if (!token) {
        setMsg('Debes abrir esta vista con una sesion admin activa.', 'err');
        return;
      }

      try {
        const r = await fetch(credentialBaseUrl + '/credentials/validate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify({ qrCodeHash, scannerId }),
        });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok || d.valid === false) {
          throw new Error(d.reason || d.message || 'QR invalido');
        }
        setMsg('Check-in correcto para ' + (d.attendeeName || 'asistente') + '.', 'ok');
      } catch (e) {
        setMsg(e.message || 'No se pudo validar QR.', 'err');
      }
    }

    window.addEventListener('message', function(event) {
      if (!event.data || event.data.type !== 'eventhive:session') {
        return;
      }
      persistSession(event.data);
    });
  </script>
</body>
</html>`;
  }

  private renderUiByRole(forcedRole: 'auto' | 'standard' | 'admin') {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ticketing Service</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#eef2f9;
      --surface:#ffffff;
      --ink:#0f172a;
      --muted:#5b6475;
      --line:#d9e2ef;
      --brand:#1d4ed8;
      --brand2:#1e3a8a;
      --ok:#166534;
      --warn:#854d0e;
      --danger:#b91c1c;
      --shadow:0 12px 28px rgba(15,23,42,.08);
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      font-family:Manrope,system-ui,sans-serif;
      color:var(--ink);
      background:radial-gradient(circle at 10% 10%, #fff7d8 0%, #eef2f9 45%, #dde8ff 100%);
    }
    .wrap{max-width:1220px;margin:0 auto;padding:18px 16px 22px}
    .top{
      background:var(--surface);
      border:1px solid var(--line);
      border-radius:16px;
      padding:14px 16px;
      box-shadow:var(--shadow);
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
    }
    .brand h1{margin:0;font-size:30px;letter-spacing:-.03em}
    .badges{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .pill{padding:6px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase}
    .pill.role{background:#e2e8f0;color:#334155;text-transform:none;letter-spacing:.01em}
    .pill.db{background:#dcfce7;color:var(--ok)}
    .pill.warn{background:#fef3c7;color:var(--warn)}

    .tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
    .tabs button{
      border:1px solid var(--line);
      background:#fff;
      color:#1f2937;
      border-radius:10px;
      height:38px;
      padding:0 12px;
      font-weight:800;
      cursor:pointer;
    }
    .tabs button.active{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;border-color:transparent}

    .panel{display:none;margin-top:14px}
    .panel.active{display:block}
    .card{
      background:var(--surface);
      border:1px solid var(--line);
      border-radius:14px;
      padding:14px;
      box-shadow:var(--shadow);
    }
    .card h2{margin:0 0 12px;font-size:18px}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    input,select,button{
      height:40px;border-radius:10px;border:1px solid #c8d4e6;padding:0 11px;
      font:inherit;font-size:14px
    }
    input:focus,select:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
    button.primary{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;border:0;font-weight:800;cursor:pointer}
    button.ghost{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe;font-weight:800;cursor:pointer}
    button.danger{background:#fee2e2;color:var(--danger);border:1px solid #fecaca;font-weight:800;cursor:pointer}

    .msg{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:13px;display:none}
    .msg.ok{display:block;background:#ecfdf3;color:var(--ok);border:1px solid #bbf7d0}
    .msg.err{display:block;background:#fef2f2;color:var(--danger);border:1px solid #fecaca}
    .msg.info{display:block;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}

    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{padding:9px 8px;border-bottom:1px solid #edf2f8;text-align:left;font-size:13px}
    th{font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#64748b}
    .small{font-size:12px;color:var(--muted)}
    .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px}
    .kpi .label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.03em}
    .kpi .value{margin-top:6px;font-size:24px;font-weight:800}

    @media(max-width:980px){
      .grid,.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
      .grid-2{grid-template-columns:1fr}
    }
    @media(max-width:640px){
      .grid,.kpis{grid-template-columns:1fr}
      .top{flex-direction:column;align-items:flex-start}
      .badges{justify-content:flex-start}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="top">
      <div class="brand">
        <h1 id="ticketUserName">Usuario</h1>
      </div>
      <div class="badges" id="badges"></div>
    </section>

    <nav class="tabs">
      <button id="tabCatalog" class="active" onclick="showTab('catalog')">Catalogo</button>
      <button id="tabBuy" onclick="showTab('buy')">Compra</button>
      <button id="tabOrders" onclick="showTab('orders')">Ordenes</button>
      <button id="tabSummary" onclick="showTab('summary')">Resumen</button>
    </nav>

    <section id="panel-catalog" class="panel active">
      <div class="card">
        <h2>Tipos de Ticket</h2>
        <div id="catalogMsg" class="msg"></div>
        <div class="grid" id="createTypeForm">
          <input id="typeName" placeholder="Nombre (General, VIP, Taller)">
          <input id="typePrice" type="number" min="1" step="0.01" placeholder="Precio">
          <input id="typeQty" type="number" min="1" step="1" placeholder="Cantidad total">
          <input id="typeMaxPerson" type="number" min="0" step="1" placeholder="Max por persona (0 = sin limite)">
          <div style="display:flex;gap:8px">
            <button class="primary" style="flex:1" onclick="createType()">Crear tipo</button>
            <button class="ghost" onclick="loadTypes()">Recargar</button>
          </div>
          <select id="typeEventId" style="height:40px;border-radius:10px;border:1px solid #c8d4e6;padding:0 11px;font:inherit;font-size:14px">
            <option value="">-- Sin evento --</option>
          </select>
          <input id="typeLocation" placeholder="Ubicación del evento (auto)" readonly style="background:#f8fafc;color:#64748b">
          <input id="typeCategory" placeholder="Categoria (opcional)">
        </div>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Vendidos</th>
              <th>Disponibles</th>
              <th>Max/persona</th>
              <th>Evento</th>
              <th>Ubicación</th>
              <th>Categoria</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="typesRows"></tbody>
        </table>
      </div>
    </section>

    <section id="panel-buy" class="panel">
      <div class="card">
        <h2>Compra de Tickets</h2>
        <div class="grid-2">
          <div class="grid">
            <select id="buyType"></select>
            <input id="buyQty" type="number" min="1" step="1" value="1">
            <select id="buyProvider">
              <option value="stripe">stripe</option>
              <option value="paypal">paypal</option>
            </select>
            <input id="buyEmail" type="email" placeholder="Correo receptor">
          </div>
          <div class="card" style="margin:0;box-shadow:none">
            <div class="small">Monto calculado</div>
            <div id="buyAmount" style="font-size:26px;font-weight:800;margin-top:6px">$0.00</div>
            <button class="primary" style="margin-top:10px;width:100%" onclick="purchase()">Comprar ahora</button>
          </div>
        </div>
        <div id="buyMsg" class="msg"></div>
      </div>
    </section>

    <section id="panel-orders" class="panel">
      <div class="card">
        <h2>Ordenes</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input id="ordersEmail" type="email" placeholder="Filtrar por correo de cuenta (solo admin)">
          <input id="ordersLimit" type="number" min="1" max="100" value="20">
          <button class="ghost" onclick="loadOrders()">Consultar</button>
        </div>
        <div id="ordersMsg" class="msg"></div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>OrderId</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Total</th>
              <th>Estado</th>
              <th>Correo</th>
            </tr>
          </thead>
          <tbody id="ordersRows"></tbody>
        </table>
      </div>
    </section>

    <section id="panel-summary" class="panel">
      <div class="card">
        <h2>Resumen Operativo</h2>
        <div class="kpis">
          <div class="kpi"><div class="label">Total ordenes</div><div class="value" id="kTotalOrders">0</div></div>
          <div class="kpi"><div class="label">Ingresos</div><div class="value" id="kRevenue">$0.00</div></div>
          <div class="kpi"><div class="label">Tickets vendidos</div><div class="value" id="kSold">0</div></div>
          <div class="kpi"><div class="label">Pagadas</div><div class="value" id="kPaid">0</div></div>
        </div>
        <div id="summaryMsg" class="msg"></div>
        <button class="ghost" style="margin-top:10px" onclick="loadSummary()">Actualizar resumen</button>
      </div>
    </section>

  </div>

  <script>
    const FORCED_ROLE = '${forcedRole}';
    const HOST_NAME = window.location.hostname || 'localhost';
    const IS_LOCAL_HOST = HOST_NAME === 'localhost' || HOST_NAME === '127.0.0.1';
    const CURRENT_ORIGIN = window.location.origin;
    const GATEWAY_BASE_URL = IS_LOCAL_HOST && window.location.port && window.location.port !== '3008'
      ? ('http://' + HOST_NAME + ':3008')
      : CURRENT_ORIGIN;
    const API = GATEWAY_BASE_URL + '/tickets';
    const USER_SERVICE_BASE_URL = GATEWAY_BASE_URL + '/users';
    const EVENT_SERVICE_BASE_URL = GATEWAY_BASE_URL + '/events';

    function readSessionFromHash() {
      try {
        const rawHash = window.location.hash ? window.location.hash.slice(1) : '';
        const params = new URLSearchParams(rawHash);
        const hashToken = params.get('token') || '';
        const hashRefreshToken = params.get('refreshToken') || '';
        if (hashToken || hashRefreshToken) {
          window.history.replaceState({}, '', window.location.pathname + window.location.search);
        }
        return {
          token: hashToken,
          refreshToken: hashRefreshToken,
        };
      } catch {
        return { token: '', refreshToken: '' };
      }
    }

    function readStoredProfile() {
      try {
        const raw = localStorage.getItem('eventhive.session.profile');
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function persistSession(session) {
      if (session.token) {
        token = session.token;
      }
      if (session.refreshToken) {
        refreshToken = session.refreshToken;
      }
      if (session.user && typeof session.user === 'object') {
        sessionProfile = {
          name: String(session.user.name || '').trim(),
          email: String(session.user.email || '').trim(),
          accountType: String(session.user.accountType || '').trim(),
        };
      }
      try {
        if (session.token) {
          localStorage.setItem('eventhive.session.token', session.token);
        }
        if (session.refreshToken) {
          localStorage.setItem('eventhive.session.refreshToken', session.refreshToken);
        }
        if (sessionProfile) {
          localStorage.setItem('eventhive.session.profile', JSON.stringify(sessionProfile));
        }
      } catch {}
    }

    const sessionFromHash = readSessionFromHash();
    let token = sessionFromHash.token || localStorage.getItem('eventhive.session.token') || '';
    let refreshToken = sessionFromHash.refreshToken || localStorage.getItem('eventhive.session.refreshToken') || '';
    let refreshInFlight = null;
    let sessionRequestInFlight = null;
    let sessionUser = null;
    let sessionProfile = readStoredProfile();
    let attemptedNameRefresh = false;
    let userRole = 'guest';
    let typesCache = [];
    let eventsCache = [];

    function canAccessTab(tab) {
      if (userRole === 'admin') {
        return ['catalog', 'orders', 'summary'].includes(tab);
      }
      if (userRole === 'standard') {
        return ['catalog', 'buy', 'orders'].includes(tab);
      }
      return tab === 'catalog';
    }

    function authHeaders(extra) {
      const headers = Object.assign({}, extra || {});
      if (token) headers['Authorization'] = 'Bearer ' + token;
      return headers;
    }

    function parseJwt(raw) {
      try {
        const payload = raw.split('.')[1];
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = atob(normalized);
        return JSON.parse(decoded);
      } catch {
        return null;
      }
    }

    function normalizeRole(role) {
      const normalized = String(role || 'guest').toLowerCase();
      if (normalized === 'standar') return 'standard';
      if (normalized === 'invitado') return 'guest';
      return normalized;
    }

    function roleLabel(role) {
      const normalized = normalizeRole(role);
      if (normalized === 'admin') return 'Organizador';
      if (normalized === 'standard') return 'Participante';
      return 'Invitado';
    }

    function translateOrderStatus(status) {
      const normalized = String(status || '').trim().toLowerCase();
      return {
        paid: 'Pagado',
        succeeded: 'Pagado',
        approved: 'Aprobado',
        pending: 'Pendiente',
        processing: 'En proceso',
        requires_action: 'Requiere accion',
        declined: 'Rechazado',
        failed: 'Fallido',
        canceled: 'Cancelado',
        cancelled: 'Cancelado',
        refunded: 'Reembolsado',
        active: 'Activo',
        archived: 'Archivado',
        finished: 'Finalizado',
      }[normalized] || (status || '-');
    }

    function resolveDisplayName() {
      const tokenEmail = String(sessionUser?.email || '').trim().toLowerCase();
      const profileEmail = String((sessionProfile && sessionProfile.email) || '').trim().toLowerCase();
      const source = (!tokenEmail || !profileEmail || tokenEmail === profileEmail)
        ? (sessionProfile || sessionUser || {})
        : (sessionUser || {});
      const explicitName = String(source.name || '').trim();
      if (explicitName) {
        return explicitName;
      }
      const email = String(source.email || '').trim();
      if (email.includes('@')) {
        return email.split('@')[0];
      }
      return roleLabel(userRole);
    }

    function updateHeader() {
      const heading = document.getElementById('ticketUserName');
      if (heading) {
        heading.textContent = resolveDisplayName();
      }
    }

    function isExpiredTokenResponse(status, text) {
      const normalizedText = String(text || '').toLowerCase();
      return (status === 401 || status === 403) && (
        normalizedText.includes('jwt expired') ||
        normalizedText.includes('token inv') ||
        normalizedText.includes('token requerido')
      );
    }

    async function refreshAccessToken() {
      if (!refreshToken) {
        await requestSessionFromContainer();
      }
      if (!refreshToken) {
        throw new Error('La sesion expiró y esta vista no tiene refresh token. Abre Tickets desde user-service o inicia sesión de nuevo.');
      }
      if (refreshInFlight) {
        return refreshInFlight;
      }

      refreshInFlight = (async function() {
        const r = await fetch(USER_SERVICE_BASE_URL + '/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: refreshToken }),
        });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok || !d.accessToken) {
          throw new Error(d.message || 'No se pudo renovar la sesión');
        }
        persistSession({ token: d.accessToken, refreshToken: d.refreshToken || refreshToken });
        bootstrap();
        return token;
      })().finally(function() {
        refreshInFlight = null;
      });

      return refreshInFlight;
    }

    async function requestSessionFromContainer() {
      if (refreshToken || sessionRequestInFlight) {
        return sessionRequestInFlight;
      }

      sessionRequestInFlight = new Promise(function(resolve) {
        let settled = false;
        const finish = function() {
          if (settled) return;
          settled = true;
          window.removeEventListener('message', onMessage);
          sessionRequestInFlight = null;
          resolve();
        };

        const onMessage = function(event) {
          if (!event.data || event.data.type !== 'eventhive:session') {
            return;
          }
          if (event.data.token || event.data.refreshToken) {
            persistSession({
              token: event.data.token || '',
              refreshToken: event.data.refreshToken || '',
              user: event.data.user || null,
            });
            bootstrap();
          }
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

      return sessionRequestInFlight;
    }

    async function apiFetch(url, options, retryOnAuth) {
      const response = await fetch(url, options || {});
      if (retryOnAuth === false) {
        return response;
      }

      const responseText = await response.clone().text().catch(function(){ return ''; });
      if (!isExpiredTokenResponse(response.status, responseText)) {
        return response;
      }

      await refreshAccessToken();
      const nextOptions = Object.assign({}, options || {});
      if (nextOptions.headers) {
        nextOptions.headers = authHeaders(nextOptions.headers);
      }
      return await apiFetch(url, nextOptions, false);
    }

    function setMsg(id, message, type) {
      const el = document.getElementById(id);
      el.className = message ? ('msg ' + type) : 'msg';
      el.textContent = message || '';
    }

    function showTab(name) {
      if (!canAccessTab(name)) {
        name = userRole === 'admin' ? 'catalog' : (userRole === 'standard' ? 'buy' : 'catalog');
      }

      ['catalog','buy','orders','summary'].forEach(function(tab){
        document.getElementById('panel-' + tab).classList.remove('active');
        document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('active');
      });
      document.getElementById('panel-' + name).classList.add('active');
      document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
      if (name === 'orders') loadOrders();
      if (name === 'summary') loadSummary();
    }

    function applyRoleUi() {
      const isAdmin = userRole === 'admin';
      const isStandard = userRole === 'standard';
      document.getElementById('createTypeForm').style.display = isAdmin ? 'grid' : 'none';
      document.getElementById('ordersEmail').style.display = isAdmin ? 'inline-block' : 'none';
      document.getElementById('tabSummary').style.display = isAdmin ? 'inline-block' : 'none';
      document.getElementById('tabBuy').style.display = isAdmin ? 'none' : (isStandard ? 'inline-block' : 'none');
      document.getElementById('tabOrders').style.display = (isAdmin || isStandard) ? 'inline-block' : 'none';

      if (isAdmin) {
        showTab('catalog');
        return;
      }
      if (isStandard) {
        showTab('buy');
        return;
      }
      showTab('catalog');
    }

    function renderBadges() {
      const badges = document.getElementById('badges');
      badges.innerHTML = '';
      const role = document.createElement('span');
      role.className = 'pill role';
      role.textContent = roleLabel(userRole);
      badges.appendChild(role);

      if (!token) {
        const warn = document.createElement('span');
        warn.className = 'pill warn';
        warn.textContent = 'sin token';
        badges.appendChild(warn);
      }
    }

    function fillTypeSelect() {
      const sel = document.getElementById('buyType');
      sel.innerHTML = '';
      const availableTypes = typesCache.filter(function(t) {
        return t.isActive !== false && (Number(t.quantity || 0) - Number(t.quantitySold || 0)) > 0;
      });
      if (!availableTypes.length) {
        const op = document.createElement('option');
        op.value = '';
        op.textContent = 'No hay tipos disponibles';
        sel.appendChild(op);
        return;
      }
      availableTypes.forEach(function(t){
        const available = Number(t.quantity || 0) - Number(t.quantitySold || 0);
        const op = document.createElement('option');
        op.value = t.id;
        op.textContent = t.name + ' | $' + Number(t.price || 0).toFixed(2) + ' | disp: ' + available;
        op.dataset.price = String(Number(t.price || 0));
        sel.appendChild(op);
      });
      calcAmount();
    }

    function calcAmount() {
      const sel = document.getElementById('buyType');
      const qty = Math.max(1, Number(document.getElementById('buyQty').value || 1));
      const selected = sel.options[sel.selectedIndex];
      const price = Number(selected?.dataset?.price || 0);
      const amount = price * qty;
      document.getElementById('buyAmount').textContent = '$' + amount.toFixed(2);
    }


    async function loadTypes() {
      setMsg('catalogMsg', '', 'info');
      try {
        const url = API + '/types' + (userRole === 'admin' ? '?includeInactive=true' : '');
        const r = await apiFetch(url, { headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || 'No se pudo cargar tipos');
        typesCache = Array.isArray(d) ? d : [];
        const rows = document.getElementById('typesRows');
        rows.innerHTML = '';
        if (!typesCache.length) {
          rows.innerHTML = '<tr><td colspan="10" class="small">No hay tipos de ticket registrados todavía.</td></tr>';
          setMsg('catalogMsg', 'No hay tipos de ticket registrados todavía.', 'info');
          fillTypeSelect();
          return;
        }
        typesCache.forEach(function(t){
          const available = Number(t.quantity || 0) - Number(t.quantitySold || 0);
          const tr = document.createElement('tr');
          const evtMatch = eventsCache.find(function(e){ return e.id === t.eventId; });
          const evtTitle = evtMatch ? evtMatch.title : (t.eventId ? t.eventId.substring(0,8)+'…' : '-');
          const evtLocation = evtMatch ? (evtMatch.location || '-') : '-';
          const isActive = t.isActive !== false;
          const state = isActive ? 'Activo' : 'Archivado';
          let actions = '<span class="small">Solo lectura</span>';
          if (userRole === 'admin') {
            if (!isActive) {
              actions = '<button class="ghost" onclick="restoreType(\\'' + t.id + '\\')">Reactivar</button>';
            } else if (Number(t.quantitySold || 0) > 0) {
              actions = '<button class="ghost" onclick="editType(\\'' + t.id + '\\')">Editar</button> <button class="danger" onclick="deleteType(\\'' + t.id + '\\')">Archivar</button>';
            } else {
              actions = '<button class="ghost" onclick="editType(\\'' + t.id + '\\')">Editar</button> <button class="danger" onclick="deleteType(\\'' + t.id + '\\')">Eliminar</button>';
            }
          }
          tr.innerHTML = '<td>' + (t.name || '-') + '</td>' +
            '<td>$' + Number(t.price || 0).toFixed(2) + '</td>' +
            '<td><strong>' + Number(t.quantitySold || 0) + '</strong></td>' +
            '<td>' + available + ' / ' + Number(t.quantity || 0) + '</td>' +
            '<td>' + Number(t.maxPerPerson || 0) + '</td>' +
            '<td>' + evtTitle + '</td>' +
            '<td class="small">' + evtLocation + '</td>' +
            '<td>' + (t.category || '-') + '</td>' +
            '<td>' + state + '</td>' +
            '<td>' + actions + '</td>';
          rows.appendChild(tr);
        });
        fillTypeSelect();
      } catch (e) {
        setMsg('catalogMsg', e.message, 'err');
      }
    }

    async function createType() {
      const body = {
        name: document.getElementById('typeName').value.trim(),
        price: Number(document.getElementById('typePrice').value || 0),
        quantity: Number(document.getElementById('typeQty').value || 0),
        maxPerPerson: Number(document.getElementById('typeMaxPerson').value || 0),
        eventId: document.getElementById('typeEventId').value.trim() || undefined,
        category: document.getElementById('typeCategory').value.trim() || undefined,
      };
      if (!body.name || body.price <= 0 || body.quantity <= 0 || body.maxPerPerson < 0) {
        setMsg('catalogMsg', 'Completa nombre, precio, cantidad y max/persona validos.', 'err');
        return;
      }
      try {
        const r = await apiFetch(API + '/types', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok) throw new Error(d.message || 'No se pudo crear tipo');
        setMsg('catalogMsg', 'Tipo de ticket creado en PostgreSQL.', 'ok');
        document.getElementById('typeName').value = '';
        document.getElementById('typePrice').value = '';
        document.getElementById('typeQty').value = '';
        document.getElementById('typeMaxPerson').value = '';
        document.getElementById('typeEventId').value = '';
        document.getElementById('typeCategory').value = '';
        await loadTypes();
      } catch (e) {
        setMsg('catalogMsg', e.message, 'err');
      }
    }

    async function editType(id) {
      if (userRole !== 'admin') return;
      const current = typesCache.find(function(x){ return x.id === id; });
      if (!current) return;

      const name = prompt('Nombre del ticket:', current.name || '');
      if (name === null) return;
      const priceRaw = prompt('Precio del ticket:', String(Number(current.price || 0)));
      if (priceRaw === null) return;
      const qtyRaw = prompt('Cantidad total:', String(Number(current.quantity || 0)));
      if (qtyRaw === null) return;
      const maxRaw = prompt('Max por persona (0 = sin limite):', String(Number(current.maxPerPerson || 0)));
      if (maxRaw === null) return;
      const cat = prompt('Categoria:', current.category || '');
      if (cat === null) return;

      const body = {
        name: name.trim(),
        price: Number(priceRaw),
        quantity: Number(qtyRaw),
        maxPerPerson: Number(maxRaw),
        category: cat.trim() || undefined,
      };

      if (!body.name || body.price <= 0 || body.quantity <= 0 || body.maxPerPerson < 0) {
        setMsg('catalogMsg', 'Valores invalidos para actualizar ticket.', 'err');
        return;
      }

      try {
        const r = await apiFetch(API + '/types/' + id, {
          method: 'PUT',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok) throw new Error(d.message || 'No se pudo actualizar tipo');
        setMsg('catalogMsg', 'Tipo actualizado correctamente.', 'ok');
        await loadTypes();
      } catch (e) {
        setMsg('catalogMsg', e.message, 'err');
      }
    }

    async function deleteType(id) {
      const current = typesCache.find(function(x){ return x.id === id; });
      const hasSales = Number(current?.quantitySold || 0) > 0;
      const question = hasSales
        ? 'Este tipo ya tiene ventas. Se archivará para preservar el historial. ¿Continuar?'
        : 'Eliminar tipo de ticket sin ventas?';
      if (!confirm(question)) return;
      try {
        const r = await apiFetch(API + '/types/' + id, { method: 'DELETE', headers: authHeaders() });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok) throw new Error(d.message || 'No se pudo eliminar tipo');
        setMsg('catalogMsg', d.message || (hasSales ? 'Tipo archivado.' : 'Tipo eliminado.'), 'ok');
        await loadTypes();
      } catch (e) {
        setMsg('catalogMsg', e.message, 'err');
      }
    }

    async function restoreType(id) {
      try {
        const r = await apiFetch(API + '/types/' + id + '/restore', {
          method: 'POST',
          headers: authHeaders(),
        });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok) throw new Error(d.message || 'No se pudo reactivar tipo');
        setMsg('catalogMsg', 'Tipo reactivado correctamente.', 'ok');
        await loadTypes();
      } catch (e) {
        setMsg('catalogMsg', e.message, 'err');
      }
    }

    async function purchase() {
      setMsg('buyMsg', '', 'info');
      if (userRole === 'admin') {
        setMsg('buyMsg', 'Las cuentas admin gestionan tickets y precios; no realizan compras.', 'info');
        return;
      }
      if (!sessionUser?.sub) {
        setMsg('buyMsg', 'No hay sesion valida para comprar.', 'err');
        return;
      }
      const ticketTypeId = document.getElementById('buyType').value;
      const quantity = Math.max(1, Number(document.getElementById('buyQty').value || 1));
      const provider = document.getElementById('buyProvider').value;
      const recipientEmail = document.getElementById('buyEmail').value.trim() || sessionUser.email || 'attendee@example.com';
      try {
        const r = await apiFetch(API + '/purchase/data', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            userId: sessionUser.sub,
            ticketTypeId,
            quantity,
            provider,
            recipientEmail,
          }),
        });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok) throw new Error(d.message || 'No se pudo completar la compra');
        setMsg('buyMsg', 'Compra realizada. Orden ' + (d.order?.id || ''), 'ok');
        await loadTypes();
        await loadOrders();
        if (userRole === 'admin') await loadSummary();
      } catch (e) {
        setMsg('buyMsg', e.message, 'err');
      }
    }

    async function loadOrders() {
      setMsg('ordersMsg', '', 'info');
      try {
        const limit = Math.max(1, Math.min(100, Number(document.getElementById('ordersLimit').value || 20)));
        const email = (document.getElementById('ordersEmail').value || '').trim();
        const q = email ? ('?email=' + encodeURIComponent(email) + '&limit=' + limit) : ('?limit=' + limit);
        const r = await apiFetch(API + '/orders' + q, { headers: authHeaders() });
        const d = await r.json().catch(function(){ return []; });
        if (!r.ok) throw new Error(d.message || 'No se pudo cargar ordenes');
        const rows = document.getElementById('ordersRows');
        rows.innerHTML = '';
        d.forEach(function(o){
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + (o.createdAt ? new Date(o.createdAt).toLocaleString() : '-') + '</td>' +
            '<td>' + (o.id || '-') + '</td>' +
            '<td>' + (o.ticketTypeName || o.ticketTypeId || '-') + '</td>' +
            '<td>' + Number(o.quantity || 1) + '</td>' +
            '<td>$' + Number(o.totalAmount || 0).toFixed(2) + '</td>' +
            '<td>' + translateOrderStatus(o.status) + '</td>' +
            '<td>' + (o.recipientEmail || '-') + '</td>';
          rows.appendChild(tr);
        });
      } catch (e) {
        setMsg('ordersMsg', e.message, 'err');
      }
    }

    async function loadSummary() {
      setMsg('summaryMsg', '', 'info');
      if (userRole !== 'admin') {
        setMsg('summaryMsg', 'Resumen disponible solo para admin.', 'info');
        return;
      }
      try {
        const r = await apiFetch(API + '/orders/summary', { headers: authHeaders() });
        const d = await r.json();
        if (!r.ok) throw new Error(d.message || 'No se pudo cargar resumen');
        document.getElementById('kTotalOrders').textContent = String(d.totalOrders || 0);
        document.getElementById('kRevenue').textContent = '$' + Number(d.totalRevenue || 0).toFixed(2);
        document.getElementById('kSold').textContent = String(d.totalTicketsSold || 0);
        document.getElementById('kPaid').textContent = String(d.paidCount || 0);
      } catch (e) {
        setMsg('summaryMsg', e.message, 'err');
      }
    }

    async function loadEvents() {
      try {
        const r = await fetch(EVENT_SERVICE_BASE_URL + '/data');
        if (!r.ok) return;
        const data = await r.json();
        eventsCache = Array.isArray(data) ? data : [];
        const sel = document.getElementById('typeEventId');
        sel.innerHTML = '<option value="">-- Sin evento --</option>';
        eventsCache.forEach(function(e) {
          const op = document.createElement('option');
          op.value = e.id;
          const range = e.startDate && e.endDate ? (e.startDate === e.endDate ? e.startDate : (e.startDate + ' a ' + e.endDate)) : (e.date ? e.date.substring(0,10) : '');
          op.textContent = e.title + (range ? ' — ' + range : '');
          op.dataset.location = e.location || '';
          sel.appendChild(op);
        });
        sel.addEventListener('change', function() {
          const opt = sel.options[sel.selectedIndex];
          document.getElementById('typeLocation').value = opt ? (opt.dataset.location || '') : '';
        });
      } catch (e) {
        console.warn('[ticketing] event-service no disponible:', e.message);
      }
    }


    function bootstrap() {
      sessionUser = token ? parseJwt(token) : null;
      userRole = normalizeRole(sessionUser?.accountType || sessionUser?.role || 'guest');
      if (FORCED_ROLE === 'admin' || FORCED_ROLE === 'standard') {
        userRole = normalizeRole(FORCED_ROLE);
      }
      updateHeader();
      renderBadges();
      applyRoleUi();
      if (!sessionUser?.name && !sessionProfile?.name && refreshToken && !attemptedNameRefresh) {
        attemptedNameRefresh = true;
        refreshAccessToken().catch(function() {
          attemptedNameRefresh = false;
        });
      }
      if (sessionUser?.email) {
        document.getElementById('buyEmail').value = sessionUser.email;
      }
      loadEvents();
      loadTypes();
      document.getElementById('buyQty').addEventListener('input', calcAmount);
      document.getElementById('buyType').addEventListener('change', calcAmount);
    }

    // Receive token from parent frame (user-service embeds this via iframe)
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'eventhive:token' && event.data.token) {
        persistSession({ token: event.data.token, user: event.data.user || null });
        bootstrap();
      }
      if (event.data && event.data.type === 'eventhive:session' && (event.data.token || event.data.refreshToken)) {
        persistSession({
          token: event.data.token || '',
          refreshToken: event.data.refreshToken || '',
          user: event.data.user || null,
        });
        bootstrap();
      }
    });

    if (token || refreshToken) {
      persistSession({ token: token, refreshToken: refreshToken });
    }

    bootstrap();
  </script>
</body>
</html>`;
  }

  @Post('data')
  async create(@Body() ticket: { title: string; description: string; status: string }) {
    return await this.ticketService.create(ticket);
  }

  @Get('types')
  async getTicketTypes(
    @Query('eventId') eventId?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('organizerId') organizerId?: string,
    @Query('organizerEmail') organizerEmail?: string,
  ) {
    const withInactive = ['true', '1', 'yes'].includes(String(includeInactive ?? '').toLowerCase());
    const organizer = {
      id: String(organizerId ?? '').trim() || undefined,
      email: String(organizerEmail ?? '').trim().toLowerCase() || undefined,
    };
    return await this.ticketService.getTicketTypes(eventId, withInactive, organizer);
  }

  @Get('types/:id/audience')
  async getTicketTypeAudience(@Param('id', new ParseUUIDPipe()) id: string, @Query('includeAdmin') includeAdmin?: string) {
    const withAdmin = ['true', '1', 'yes'].includes(String(includeAdmin ?? '').toLowerCase());
    return await this.ticketService.getTicketTypeAudienceWithOptions(id, withAdmin);
  }

  @Post('types')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async createTicketType(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      price: number;
      quantity: number;
      eventId?: string;
      category?: string;
      maxPerPerson?: number;
    },
  ) {
    if (!body.name || body.price < 0 || body.quantity < 0) {
      throw new BadRequestException('Invalid ticket type data');
    }
    const organizer = req?.user || {};
    return await this.ticketService.createTicketType({
      ...body,
      organizerId: organizer.sub || organizer.id,
      organizerName: organizer.name,
      organizerEmail: organizer.email,
    });
  }

  @Put('types/:id')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async updateTicketType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body()
    body: {
      name?: string;
      price?: number;
      quantity?: number;
      category?: string;
      maxPerPerson?: number;
    },
  ) {
    return await this.ticketService.updateTicketType(id, body);
  }

  @Delete('types/:id')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async deleteTicketType(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.ticketService.deleteTicketType(id);
  }

  @Post('types/:id/restore')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async restoreTicketType(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.ticketService.restoreTicketType(id);
  }

  @Get('orders')
  @UseGuards(RoleGuard)
  @Roles('standard', 'admin')
  async getOrders(
    @Req() req: any,
    @Query('userId') userId?: string,
    @Query('email') email?: string,
    @Query('limit') limit?: string,
  ) {
    const role = req.user?.accountType || req.user?.role || 'guest';
    const requesterId = req.user?.sub;
    const filters = role === 'admin'
      ? { userId, email }
      : { userId: requesterId };
    return await this.ticketService.getOrders(filters, Number(limit ?? 50));
  }

  @Get('orders/summary')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async ordersSummary() {
    return await this.ticketService.getOrdersSummary();
  }

  @Post('purchase/data')
  @UseGuards(RoleGuard)
  @Roles('standard')
  async purchase(
    @Body()
    body: {
      userId: string;
      ticketTypeId?: string;
      quantity?: number;
      title?: string;
      description?: string;
      amount?: number;
      provider: 'stripe' | 'paypal';
      recipientEmail?: string;
      cardToken?: string;
    },
  ) {
    return await this.ticketService.purchaseTicket(body);
  }

  @Get('summary')
  async summary() {
    return { total: await this.ticketService.countAll() };
  }

  @Get('data')
  async findAll(@Query('limit') limit?: string) {
    return await this.ticketService.findAll(Number(limit ?? 50));
  }

  @Delete('data/:id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.ticketService.remove(id);
  }
}
