import { Controller, Get, Header, Param } from '@nestjs/common';

function normalizeServiceBaseUrl(value: string | undefined, fallback: string) {
  const candidate = String(value ?? fallback)
    .trim()
    .replace(/\/+$/, '');

  if (!candidate) {
    return fallback;
  }

  return /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
}

@Controller('mobile')
export class MobileController {
  private readonly services = {
    event: normalizeServiceBaseUrl(process.env.EVENT_SERVICE_URL, 'http://localhost:3001'),
    ticketing: normalizeServiceBaseUrl(process.env.TICKETING_SERVICE_URL, 'http://localhost:3002'),
    notification: normalizeServiceBaseUrl(process.env.NOTIFICATION_SERVICE_URL, 'http://localhost:3003'),
    agenda: normalizeServiceBaseUrl(process.env.AGENDA_SERVICE_URL, 'http://localhost:3005'),
  };

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi() {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mobile API Service</title><style>:root{--bg:#eefcfb;--ink:#0f172a;--card:#fff;--line:#cbd5e1;--brand:#0f766e}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#ccfbf1,#eefcfb,#dbeafe);font-family:Segoe UI,Tahoma,sans-serif;color:var(--ink)}.wrap{max-width:1100px;margin:24px auto;padding:0 16px}.head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:14px}.row{display:grid;grid-template-columns:1fr auto auto;gap:8px}input,button{padding:10px;border:1px solid #cbd5e1;border-radius:8px}button{background:var(--brand);color:#fff;border:0;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:12px}.tile{border:1px solid #dbeafe;background:#f8fafc;border-radius:10px;padding:10px}.tile b{font-size:28px}.mini{margin-top:10px;font-size:12px;color:#475569}@media(max-width:900px){.row{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}}</style><style id="ui-polish-v2">:root{--ui-bg:#f7f8fc;--ui-surface:#ffffff;--ui-text:#0f172a;--ui-muted:#5b6475;--ui-line:#dbe2ee;--ui-brand:#1d4ed8;--ui-brand-2:#1e40af}body{font-family:Manrope,ui-sans-serif,sans-serif!important;background:linear-gradient(160deg,#fef3c7 0,#f7f8fc 46%,#dbeafe 100%)!important;color:var(--ui-text)!important}.wrap{max-width:1080px!important;margin:20px auto!important;padding:0 14px!important}.hero,.head,.title{gap:10px!important;align-items:flex-end!important}.box,.card,section.card{background:var(--ui-surface)!important;border:1px solid var(--ui-line)!important;border-radius:14px!important;padding:14px!important;box-shadow:0 10px 22px rgba(15,23,42,.06)!important}h1{font-size:32px!important;line-height:1.1!important;margin:0!important}h2,h3{letter-spacing:-.01em}p,small,.mini,.meta,.help,.sub{color:var(--ui-muted)!important}input,select,button{min-height:42px!important;padding:10px 12px!important;border-radius:10px!important;border:1px solid #c7d2e5!important}input:focus,select:focus{outline:2px solid #93c5fd!important;border-color:#93c5fd!important}button{font-weight:700!important;cursor:pointer!important;transition:transform .12s ease,box-shadow .12s ease!important}button:hover{transform:translateY(-1px)}button:not(.ghost):not(.btnGhost):not(.danger):not(.warn):not(.alt){background:linear-gradient(135deg,var(--ui-brand),var(--ui-brand-2))!important;color:#fff!important;border:0!important;box-shadow:0 8px 18px rgba(29,78,216,.22)!important}button.ghost,.btnGhost{background:#fff!important;color:#1e3a8a!important;border:1px solid #bfdbfe!important}ul{padding-left:0!important}ul li,.item{border-radius:12px!important}table{border-radius:10px;overflow:hidden}th,td{padding:10px 8px!important}@media(max-width:900px){.wrap{padding:0 12px!important}.row,.row2,.row4,.grid,.geo,.gridSession,.gridFav,.kpis,.kpi{grid-template-columns:1fr!important}.title h1,h1.title,.hero h1,h1{font-size:26px!important}}</style></head><body><div class="wrap"><div class="head"><div><h1 style="margin:0">Mobile API Service (BFF)</h1><p style="margin:4px 0 0;color:#475569">Vista agregada para app movil.</p></div><button id="reload">Recargar</button></div><section class="card"><div class="row"><input id="userId" placeholder="userId" value="demo-user"><button id="load">Cargar dashboard</button><button id="clear">Limpiar</button></div><div class="grid"><div class="tile">Eventos<br><b id="events">0</b></div><div class="tile">Tickets<br><b id="tickets">0</b></div><div class="tile">Notificaciones<br><b id="notifications">0</b></div><div class="tile">Sesiones<br><b id="sessions">0</b></div><div class="tile">Favoritos<br><b id="favorites">0</b></div></div><div class="mini" id="meta"></div></section></div><script>async function load(){const userId=document.getElementById('userId').value||'demo-user';const r=await fetch('/mobile/dashboard/'+encodeURIComponent(userId));const d=await r.json();document.getElementById('events').textContent=String(d.events||0);document.getElementById('tickets').textContent=String(d.tickets||0);document.getElementById('notifications').textContent=String(d.notifications||0);document.getElementById('sessions').textContent=String(d.sessions||0);document.getElementById('favorites').textContent=String(d.favorites||0);document.getElementById('meta').textContent='Actualizado: '+new Date().toLocaleString()+' | userId: '+userId;}document.getElementById('load').onclick=load;document.getElementById('reload').onclick=load;document.getElementById('clear').onclick=()=>{if(!confirm('Confirmar limpieza de dashboard?')){return;}['events','tickets','notifications','sessions','favorites'].forEach(id=>document.getElementById(id).textContent='0');document.getElementById('meta').textContent='';};load();setInterval(()=>{if(document.visibilityState==='visible'){load();}},15000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){load();}});</script></body></html>`;
  }

  @Get('health')
  status() {
    return { service: 'mobile-api-service', status: 'ok' };
  }

  @Get('dashboard/:userId')
  async getDashboard(@Param('userId') userId: string) {
    const [events, tickets, notifications, agenda] = await Promise.all([
      this.safeFetch(this.urlFor('event', '/events/summary'), { total: 0 }),
      this.safeFetch(this.urlFor('ticketing', '/tickets/summary'), { total: 0 }),
      this.safeFetch(this.urlFor('notification', '/notifications/summary'), { total: 0 }),
      this.safeFetch(this.urlFor('agenda', `/agenda/summary/${userId}`), { sessions: 0, favorites: 0 }),
    ]);

    return {
      userId,
      events: Number((events as { total?: number }).total ?? 0),
      tickets: Number((tickets as { total?: number }).total ?? 0),
      notifications: Number((notifications as { total?: number }).total ?? 0),
      sessions: Number((agenda as { sessions?: number }).sessions ?? 0),
      favorites: Number((agenda as { favorites?: number }).favorites ?? 0),
    };
  }

  private async safeFetch<T>(url: string, fallback: T): Promise<T> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return fallback;
      }
      return (await response.json()) as T;
    } catch {
      return fallback;
    }
  }

  private urlFor(service: keyof MobileController['services'], path: string) {
    return `${this.services[service]}${path}`;
  }
}
