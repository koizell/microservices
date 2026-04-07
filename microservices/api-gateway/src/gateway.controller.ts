import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { GatewayServiceKey, resolveGatewayServiceUrls } from './gateway.constants';
import { RoleGuard } from './guards/role.guard';
import { Roles } from './decorators/roles.decorator';

@Controller('gateway')
export class GatewayController {
  private readonly services = resolveGatewayServiceUrls();

  constructor(private readonly jwtService: JwtService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi() {
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>API Gateway EventHive</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap');
:root{--bg:#f6f8ff;--ink:#0f172a;--muted:#556074;--card:#ffffff;--line:#dbe3f0;--brand:#1d4ed8;--brand2:#1e40af;--ok:#0f766e;--warn:#b91c1c;--amber:#92400e}
*{box-sizing:border-box}
body{margin:0;font-family:Manrope,ui-sans-serif,sans-serif;color:var(--ink);background:radial-gradient(circle at 8% 0,#fde68a 0,#f6f8ff 44%,#dbeafe 100%)}
.wrap{max-width:1180px;margin:22px auto;padding:0 16px}
.top{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.top h1{margin:0;font-size:42px;letter-spacing:-.02em;line-height:1}
.top p{margin:8px 0 0;color:var(--muted)}
.statusBar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pill{display:inline-flex;align-items:center;padding:5px 10px;border-radius:999px;font-size:12px;font-weight:800}
.pill.lock{background:#fee2e2;color:#991b1b}
.pill.open{background:#dcfce7;color:#166534}
.btn{border:0;border-radius:11px;padding:11px 14px;font-weight:800;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease}
.btn:hover{transform:translateY(-1px)}
.btnPrimary{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;box-shadow:0 8px 20px rgba(29,78,216,.22)}
.btnGhost{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe}
.btnWarn{background:#dc2626;color:#fff}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:15px;box-shadow:0 10px 24px rgba(15,23,42,.08)}
.card h3{margin:0 0 6px;font-size:28px;letter-spacing:-.01em}
.help{margin:0 0 10px;color:var(--muted);font-size:14px}
.row3{display:grid;grid-template-columns:1fr 1fr auto;gap:9px}
.row5{display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:9px}
input{width:100%;min-height:42px;padding:10px 12px;border:1px solid #c7d2e5;border-radius:10px}
input:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
.msg{margin-top:8px;font-size:13px;font-weight:700;min-height:18px}
.msg.ok{color:var(--ok)}
.msg.err{color:var(--warn)}
.msg.info{color:#1e3a8a}
.token{margin-top:8px;padding:10px;border:1px solid #dbe3f0;border-radius:10px;background:#f8fbff;font-family:Consolas,ui-monospace,monospace;font-size:12px;word-break:break-all}
.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:8px}
.kpi{border:1px solid #dbe3f0;border-radius:12px;padding:11px;background:#ffffff}
.kpi b{display:block;font-size:30px;line-height:1.1;margin-top:4px}
.activity{margin-top:10px;border:1px dashed #cbd5e1;border-radius:12px;padding:10px;background:#f8fafc;min-height:80px;font-size:13px;color:#334155}
.activity ul{margin:0;padding-left:18px}
.activity li{margin:6px 0}
.section{margin-top:14px}
.tools{display:flex;gap:8px;flex-wrap:wrap}
.inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.toggle{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#334155}
@media(max-width:1020px){.grid{grid-template-columns:1fr}.row3,.row5,.kpis{grid-template-columns:1fr 1fr}.top h1{font-size:34px}}
@media(max-width:680px){.row3,.row5,.kpis{grid-template-columns:1fr}.top h1{font-size:28px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div>
      <h1>API Gateway EventHive</h1>
      <p>Control central de autenticacion, dashboard y flujo ticket.purchased.</p>
    </div>
    <div class="statusBar">
      <span id="authPill" class="pill lock">Sin autenticar</span>
      <button id="refresh" class="btn btnGhost">Recargar dashboard</button>
    </div>
  </div>

  <div class="grid">
    <section class="card">
      <h3>Login</h3>
      <p class="help">Ingresa con un usuario existente para habilitar dashboard y operaciones protegidas.</p>
      <div class="row3">
        <input id="email" placeholder="email@dominio.com">
        <input id="password" type="password" placeholder="password">
        <button id="loginBtn" class="btn btnPrimary">Login</button>
      </div>
      <div class="tools section">
        <button id="logoutBtn" class="btn btnWarn" style="display:none">Cerrar sesion</button>
        <button id="copyTokenBtn" class="btn btnGhost" style="display:none">Copiar token</button>
      </div>
      <div id="loginMsg" class="msg info"></div>
      <div id="tokenBox" class="token">Sin token</div>
    </section>

    <section class="card">
      <h3>Flujo ticket.purchased</h3>
      <p class="help">Dispara el flujo completo (credencial + analytics + notificacion) desde el gateway.</p>
      <div class="row5">
        <input id="orderItemId" placeholder="orderItemId" value="order-001">
        <input id="ticketTypeId" placeholder="ticketTypeId" value="vip">
        <input id="attendeeName" placeholder="attendeeName" value="Invitado Demo">
        <input id="amount" type="number" min="1" placeholder="amount" value="120">
        <button id="purchaseBtn" class="btn btnPrimary" disabled>Ejecutar flujo</button>
      </div>
      <div id="purchaseMsg" class="msg info"></div>
      <div id="purchaseResult" class="activity">Aun no hay ejecuciones.</div>
    </section>
  </div>

  <section class="card section">
    <div class="inline" style="justify-content:space-between">
      <h3 style="margin:0">Dashboard</h3>
      <label class="toggle"><input id="autoRefresh" type="checkbox" checked> Auto refresh (3s)</label>
    </div>
    <p class="help">Vista agregada de servicios conectados al gateway.</p>
    <div class="kpis">
      <div class="kpi">Users<b id="users">0</b></div>
      <div class="kpi">Events<b id="events">0</b></div>
      <div class="kpi">Tickets<b id="tickets">0</b></div>
      <div class="kpi">Notifications<b id="notifications">0</b></div>
      <div class="kpi">Credentials<b id="credentials">0</b></div>
      <div class="kpi">Analytics<b id="analytics">0</b></div>
    </div>
    <div id="dashMsg" class="msg info"></div>
    <div id="activityLog" class="activity"><ul id="activityItems"></ul></div>
  </section>
</div>

<script>
let token = '';
let timer = null;
const auth = () => token ? { 'Authorization': 'Bearer ' + token } : {};

const el = (id) => document.getElementById(id);
function safeText(v){ return (v ?? '').toString(); }

function maskToken(t){
  if(!t) return 'Sin token';
  if(t.length < 24) return t;
  return t.slice(0, 18) + ' ... ' + t.slice(-12);
}

function setAuthUI(isAuth){
  const pill = el('authPill');
  pill.className = 'pill ' + (isAuth ? 'open' : 'lock');
  pill.textContent = isAuth ? 'Autenticado' : 'Sin autenticar';
  el('purchaseBtn').disabled = !isAuth;
  el('logoutBtn').style.display = isAuth ? 'inline-flex' : 'none';
  el('copyTokenBtn').style.display = isAuth ? 'inline-flex' : 'none';
}

function setMsg(id, text, type){
  const node = el(id);
  node.className = 'msg ' + (type || 'info');
  node.textContent = text;
}

function pushActivity(text){
  const ul = el('activityItems');
  if(!ul) return;
  const li = document.createElement('li');
  li.textContent = new Date().toLocaleTimeString() + ' - ' + text;
  ul.prepend(li);
  while(ul.children.length > 8) ul.removeChild(ul.lastChild);
}

async function loadDashboard(){
  if(!token){
    setMsg('dashMsg','Login requerido para cargar dashboard.','info');
    return;
  }
  try {
    const r = await fetch('/gateway/dashboard', { headers: auth() });
    const d = await r.json().catch(() => ({}));
    if(!r.ok){
      setMsg('dashMsg','Error dashboard: ' + (d.message || r.status),'err');
      return;
    }
    el('users').textContent = String(d.users || 0);
    el('events').textContent = String(d.events || 0);
    el('tickets').textContent = String(d.tickets || 0);
    el('notifications').textContent = String(d.notifications || 0);
    el('credentials').textContent = String(d.credentials || 0);
    el('analytics').textContent = String(d.analytics || 0);
    setMsg('dashMsg','Dashboard actualizado: ' + new Date().toLocaleString(),'ok');
  } catch {
    setMsg('dashMsg','No se pudo conectar al dashboard.','err');
  }
}

async function doLogin(){
  const email = el('email').value.trim();
  const password = el('password').value;
  if(!email || !password){
    setMsg('loginMsg','Ingresa email y password.','err');
    return;
  }
  try{
    const r = await fetch('/gateway/login', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ email, password })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok){
      setMsg('loginMsg','Credenciales invalidas.','err');
      return;
    }
    token = safeText(d.accessToken);
    el('tokenBox').textContent = maskToken(token);
    setAuthUI(!!token);
    setMsg('loginMsg','Login exitoso. Redirigiendo...','ok');
    pushActivity('Usuario autenticado (' + email + ') - Tipo: ' + (d.accountType || 'guest'));
    
    // Guardar información del usuario en localStorage
    localStorage.setItem('userToken', token);
    localStorage.setItem('userAccountType', d.accountType || 'guest');
    localStorage.setItem('userEmail', d.user?.email || email);
    localStorage.setItem('userId', d.user?.id || '');
    
    // Redirigir según el tipo de cuenta después de 1.5 segundos
    setTimeout(() => {
      const redirectUrl = d.redirectUrl || '/gateway/dashboard-guest';
      window.location.href = redirectUrl;
    }, 1500);
    
  } catch {
    setMsg('loginMsg','No se pudo realizar el login.','err');
  }
}

function doLogout(){
  token = '';
  setAuthUI(false);
  el('tokenBox').textContent = 'Sin token';
  setMsg('loginMsg','Sesion cerrada.','info');
  setMsg('dashMsg','Login requerido para cargar dashboard.','info');
  ['users','events','tickets','notifications','credentials','analytics'].forEach(id => el(id).textContent = '0');
  pushActivity('Sesion cerrada');
}

async function executePurchaseFlow(){
  if(!token){
    setMsg('purchaseMsg','Login requerido.','err');
    return;
  }
  const orderItemId = el('orderItemId').value.trim();
  const ticketTypeId = el('ticketTypeId').value.trim();
  const attendeeName = el('attendeeName').value.trim();
  const amount = Number(el('amount').value || 0);
  if(!orderItemId || !ticketTypeId || !attendeeName || amount <= 0){
    setMsg('purchaseMsg','Completa los campos del flujo y monto > 0.','err');
    return;
  }
  if(!confirm('Confirmar ejecucion del flujo ticket.purchased?')) return;

  try{
    const r = await fetch('/gateway/tickets/purchased', {
      method:'POST',
      headers:Object.assign({'Content-Type':'application/json'}, auth()),
      body:JSON.stringify({
        orderItemId,
        ticketTypeId,
        attendeeName,
        amount,
        quantity:1,
        recipientEmail:el('email').value.trim() || 'attendee@example.com'
      })
    });
    const d = await r.json().catch(() => ({}));
    if(!r.ok){
      setMsg('purchaseMsg','Error: ' + (d.message || r.status),'err');
      return;
    }
    setMsg('purchaseMsg','Flujo ejecutado correctamente.','ok');
    el('purchaseResult').innerHTML = '<ul>' +
      '<li>Credential: ' + (d.credential && d.credential.id ? d.credential.id : 'n/a') + '</li>' +
      '<li>Notification: ' + (d.notification && d.notification.id ? d.notification.id : 'n/a') + '</li>' +
      '<li>Analytics status: ' + ((d.analytics && d.analytics.status) || 'ok') + '</li>' +
      '</ul>';
    pushActivity('ticket.purchased enviado para ' + attendeeName);
    loadDashboard();
  } catch {
    setMsg('purchaseMsg','No se pudo ejecutar el flujo.','err');
  }
}

function updateAutoRefresh(){
  if(timer){ clearInterval(timer); timer = null; }
  if(el('autoRefresh').checked){
    timer = setInterval(() => {
      if(token && document.visibilityState === 'visible'){ loadDashboard(); }
    }, 15000);
  }
}

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && token && el('autoRefresh').checked){
    loadDashboard();
  }
});

el('loginBtn').onclick = doLogin;
el('logoutBtn').onclick = doLogout;
el('purchaseBtn').onclick = executePurchaseFlow;
el('refresh').onclick = loadDashboard;
el('autoRefresh').onchange = updateAutoRefresh;
el('copyTokenBtn').onclick = async () => {
  if(!token) return;
  try{
    await navigator.clipboard.writeText(token);
    setMsg('loginMsg','Token copiado al portapapeles.','ok');
  } catch {
    setMsg('loginMsg','No se pudo copiar el token.','err');
  }
};
el('password').addEventListener('keydown', (e) => { if(e.key === 'Enter') doLogin(); });

setAuthUI(false);
setMsg('dashMsg','Login requerido para cargar dashboard.','info');
updateAutoRefresh();
</script>
</body>
</html>`;
  }

  @Get('health')
  status() {
    return { service: 'api-gateway', status: 'ok' };
  }

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const response = await fetch(this.urlFor('user', '/users/auth/login'), {
      method: 'POST',
      headers: this.buildInternalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const loginResponse = await response.json();
    
    // Enriquecer respuesta con información de redirección basada en accountType
    const accountType = loginResponse.user?.accountType || 'guest';
    const redirectUrl = this.getRedirectUrl(accountType);
    const dashboardUrl = this.getDashboardUrl(accountType);
    
    return {
      ...loginResponse,
      redirectUrl,
      dashboardUrl,
      accountType,
    };
  }

  private getRedirectUrl(accountType: string): string {
    const redirectMap: Record<string, string> = {
      admin: '/gateway/dashboard-admin',
      standard: '/gateway/dashboard-standard',
      guest: '/gateway/dashboard-guest',
    };
    return redirectMap[accountType] || '/gateway/dashboard-guest';
  }

  private getDashboardUrl(accountType: string): string {
    const dashboardMap: Record<string, string> = {
      admin: 'Dashboard Administrativo - Gestión Completa',
      standard: 'Dashboard Usuario - Compra de Tickets',
      guest: 'Vista Eventos - Solo Lectura',
    };
    return dashboardMap[accountType] || 'Vista Eventos';
  }

  @Get('dashboard')
  @UseGuards(RoleGuard)
  @Roles('admin', 'standard')
  async dashboard(@Headers('authorization') authorization?: string) {
    this.assertToken(authorization);

    const [users, events, tickets, notifications, credentials, analytics] = await Promise.all([
      this.safeFetch(this.urlFor('user', '/users/summary'), { total: 0 }),
      this.safeFetch(this.urlFor('event', '/events/summary'), { total: 0 }),
      this.safeFetch(this.urlFor('ticketing', '/tickets/summary'), { total: 0 }),
      this.safeFetch(this.urlFor('notification', '/notifications/summary'), { total: 0 }),
      this.safeFetch(this.urlFor('credential', '/credentials/summary'), { total: 0 }),
      this.safeFetch(this.urlFor('analytics', '/analytics/summary'), { daysTracked: 0 }),
    ]);

    return {
      users: Number((users as { total?: number }).total ?? 0),
      events: Number((events as { total?: number }).total ?? 0),
      tickets: Number((tickets as { total?: number }).total ?? 0),
      notifications: Number((notifications as { total?: number }).total ?? 0),
      credentials: Number((credentials as { total?: number }).total ?? 0),
      analytics: Number((analytics as { daysTracked?: number }).daysTracked ?? 0),
    };
  }

  @Post('tickets/purchased')
  @UseGuards(RoleGuard)
  @Roles('standard', 'admin')
  async ticketPurchased(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: {
      orderItemId: string;
      ticketTypeId: string;
      attendeeName: string;
      amount: number;
      quantity?: number;
      recipientEmail?: string;
    },
    @Req() req: any,
  ) {
    this.assertToken(authorization);

    const [credential, analytics] = await Promise.all([
      this.postJson(
        this.urlFor('credential', '/credentials/from-ticket'),
        {
          orderItemId: body.orderItemId,
          ticketTypeId: body.ticketTypeId,
          attendeeName: body.attendeeName,
        },
        authorization ? { Authorization: authorization } : undefined,
      ),
      this.postJson(this.urlFor('analytics', '/analytics/ingest/ticket-purchased'), {
        amount: body.amount,
        quantity: body.quantity ?? 1,
      }),
    ]);

    const notification = await this.postJson(this.urlFor('notification', '/notifications/data'), {
      message: `Compra procesada para ${body.attendeeName}`,
      recipient: body.recipientEmail ?? req.user?.email ?? 'attendee@example.com',
      read: false,
    });

    return {
      event: 'ticket.purchased',
      credential,
      analytics,
      notification,
    };
  }

  @Get('dashboard-admin')
  @UseGuards(RoleGuard)
  @Roles('admin')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderAdminDashboard(@Headers('authorization') authorization?: string) {
    this.assertToken(authorization);
    return this.renderDashboardHtml('admin', 'Dashboard Administrativo', [
      { title: 'Gestión de Usuarios', icon: '👥', link: '/users/data', desc: 'Ver, crear, editar y eliminar usuarios' },
      { title: 'Gestión de Eventos', icon: '📅', link: '/events', desc: 'Organizar y supervisar todos los eventos' },
      { title: 'Gestión de Tickets', icon: '🎫', link: '/tickets', desc: 'Administrar ventas y distribución de tickets' },
      { title: 'Notificaciones', icon: '🔔', link: '/notifications', desc: 'Sistema de comunicación con usuarios' },
      { title: 'Credenciales', icon: '🔐', link: '/credentials', desc: 'Gestionar credenciales de acceso' },
      { title: 'Analytics', icon: '📊', link: '/analytics', desc: 'Reportes y análisis de la plataforma' },
    ]);
  }

  @Get('dashboard-standard')
  @UseGuards(RoleGuard)
  @Roles('standard', 'admin')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderStandardDashboard(@Headers('authorization') authorization?: string) {
    this.assertToken(authorization);
    return this.renderDashboardHtml('standard', 'Dashboard Usuario', [
      { title: 'Mis Eventos', icon: '📅', link: '/events', desc: 'Ver eventos disponibles' },
      { title: 'Comprar Tickets', icon: '🎫', link: '/tickets/purchase', desc: 'Adquirir tickets para eventos' },
      { title: 'Mis Credenciales', icon: '🎟️', link: '/credentials', desc: 'Ver mis credenciales y accesos' },
      { title: 'Mis Notificaciones', icon: '🔔', link: '/notifications', desc: 'Notificaciones personales' },
      { title: 'Mi Perfil', icon: '👤', link: '/users/profile', desc: 'Gestionar mi cuenta' },
    ]);
  }

  @Get('dashboard-guest')
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderGuestDashboard() {
    return this.renderDashboardHtml('guest', 'Vista Eventos', [
      { title: 'Explorar Eventos', icon: '📅', link: '/events', desc: 'Descubre eventos disponibles' },
      { title: 'Ver Detalles', icon: '🔍', link: '/events', desc: 'Información completa de eventos' },
      { title: 'Contacto', icon: '✉️', link: '/contact', desc: 'Ponte en contacto con nosotros' },
    ]);
  }

  private renderDashboardHtml(role: string, title: string, items: Array<{title: string; icon: string; link: string; desc: string}>) {
    const itemsHtml = items.map(item => `
      <a href="${item.link}" class="menu-item">
        <div class="menu-icon">${item.icon}</div>
        <div class="menu-content">
          <h3>${item.title}</h3>
          <p>${item.desc}</p>
        </div>
        <div class="menu-arrow">→</div>
      </a>
    `).join('');

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - EventHive</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --brand: #e85d04;
  --brand2: #dc2f02;
  --ink: #111827;
  --muted: #6b7280;
  --line: #e5e7eb;
  --surface: #ffffff;
  --bg: #f9fafb;
}
body {
  font-family: Manrope, sans-serif;
  background: var(--bg);
  color: var(--ink);
  min-height: 100vh;
}
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 20px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40px;
  border-bottom: 2px solid var(--line);
  padding-bottom: 20px;
}
.header h1 {
  font-size: 32px;
  font-weight: 800;
}
.header-info {
  display: flex;
  align-items: center;
  gap: 15px;
}
.badge {
  display: inline-block;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}
.badge-admin {
  background: #ede9fe;
  color: #6d28d9;
}
.badge-standard {
  background: #dbeafe;
  color: #1d4ed8;
}
.badge-guest {
  background: #f3f4f6;
  color: #374151;
}
.logout-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #dc2626;
  color: white;
  cursor: pointer;
  font-weight: 600;
  transition: opacity 0.2s;
}
.logout-btn:hover {
  opacity: 0.8;
}
.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  cursor: pointer;
  text-decoration: none;
  color: var(--ink);
  transition: all 0.3s;
}
.menu-item:hover {
  border-color: var(--brand);
  box-shadow: 0 8px 24px rgba(232, 93, 4, 0.2);
  transform: translateY(-4px);
}
.menu-icon {
  font-size: 40px;
  flex-shrink: 0;
}
.menu-content {
  flex: 1;
}
.menu-content h3 {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 4px;
}
.menu-content p {
  font-size: 13px;
  color: var(--muted);
}
.menu-arrow {
  color: var(--brand);
  font-size: 24px;
  flex-shrink: 0;
}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>🎉 EventHive</h1>
      <p style="color: var(--muted); margin-top: 4px;">${title}</p>
    </div>
    <div class="header-info">
      <span class="badge badge-${role}">${role}</span>
      <button class="logout-btn" onclick="doLogout()">Cerrar Sesión</button>
    </div>
  </div>
  
  <div class="menu-grid">
    ${itemsHtml}
  </div>
</div>

<script>
function doLogout() {
  localStorage.removeItem('userToken');
  localStorage.removeItem('userAccountType');
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userId');
  window.location.href = '/gateway';
}
</script>
</body>
</html>`;
  }

  private assertToken(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token requerido');
    }

    const token = authorization.slice('Bearer '.length);
    try {
      this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET ?? 'dev_only_change_me',
      });
    } catch {
      throw new UnauthorizedException('Token invalido');
    }
  }

  private async safeFetch<T>(url: string, fallback: T): Promise<T> {
    try {
      const response = await fetch(url, { headers: this.buildInternalHeaders() });
      if (!response.ok) {
        return fallback;
      }
      return (await response.json()) as T;
    } catch {
      return fallback;
    }
  }

  private async postJson(url: string, payload: unknown, headers?: Record<string, string>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildInternalHeaders({ 'Content-Type': 'application/json', ...(headers ?? {}) }),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { ok: false, status: response.status };
    }

    return await response.json();
  }

  private buildInternalHeaders(headers: Record<string, string> = {}) {
    const normalized = { ...headers, 'x-forwarded-by': 'api-gateway' };
    const internalApiKey = String(process.env.INTERNAL_API_KEY ?? '').trim();
    if (internalApiKey) {
      normalized['x-internal-api-key'] = internalApiKey;
    }
    return normalized;
  }

  private urlFor(service: GatewayServiceKey, path: string) {
    return `${this.services[service]}${path}`;
  }
}

