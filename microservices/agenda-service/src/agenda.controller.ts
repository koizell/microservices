import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { AgendaService } from './agenda.service';

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agendaService: AgendaService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi() {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agenda Service</title><style>@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap');:root{--bg:#fffaf0;--ink:#0f172a;--muted:#475569;--card:#ffffff;--line:#e2e8f0;--brand:#1d4ed8;--brand2:#1e40af;--soft:#f8fafc;--ok:#0f766e}*{box-sizing:border-box}body{margin:0;font-family:Manrope,ui-sans-serif,sans-serif;background:radial-gradient(circle at 8% 0,#fde68a 0,#fffaf0 42%,#e0f2fe 100%);color:var(--ink)}.wrap{max-width:1100px;margin:26px auto;padding:0 18px}.head{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px}.title{margin:0;font-size:42px;line-height:1;letter-spacing:-.02em}.sub{margin:8px 0 0;color:var(--muted);font-size:15px}.btn{border:0;border-radius:11px;padding:11px 14px;font-weight:700;cursor:pointer;transition:transform .14s ease,box-shadow .14s ease}.btn:hover{transform:translateY(-1px)}.btnPrimary{background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;box-shadow:0 8px 20px rgba(29,78,216,.22)}.btnGhost{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe}.stack{display:grid;gap:14px;margin-top:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 12px 28px rgba(15,23,42,.08)}.card h3{margin:0 0 6px;font-size:28px;letter-spacing:-.01em}.help{margin:0 0 12px;color:var(--muted);font-size:14px}.gridSession{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr 120px auto;gap:9px}.gridFav{display:grid;grid-template-columns:1fr 1fr auto auto;gap:9px}input{width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#0f172a}input:focus{outline:2px solid #93c5fd;border-color:#93c5fd}.kpi{display:inline-flex;align-items:center;gap:8px;padding:5px 10px;border-radius:999px;background:#eff6ff;color:#1e3a8a;font-size:12px;font-weight:700}.list{list-style:none;padding:0;margin:0;display:grid;gap:9px}.item{border:1px solid var(--line);border-radius:12px;background:var(--soft);padding:12px}.itemTop{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}.item h4{margin:0;font-size:22px;line-height:1.05}.meta{margin-top:5px;color:#334155;font-size:14px}.desc{margin-top:8px;color:#1f2937}.tiny{margin-top:8px;color:#64748b;font-size:12px}.badge{display:inline-block;padding:4px 9px;border-radius:999px;background:#dbeafe;color:#1e3a8a;font-size:12px;font-weight:700}.empty{padding:10px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;background:#f8fafc}.ok{color:var(--ok);font-weight:700}.sectionBar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}@media(max-width:1080px){.gridSession{grid-template-columns:1fr 1fr}.gridFav{grid-template-columns:1fr 1fr}.title{font-size:34px}}@media(max-width:640px){.gridSession,.gridFav{grid-template-columns:1fr}.title{font-size:30px}}</style><style id="ui-polish-v2">:root{--ui-bg:#f7f8fc;--ui-surface:#ffffff;--ui-text:#0f172a;--ui-muted:#5b6475;--ui-line:#dbe2ee;--ui-brand:#1d4ed8;--ui-brand-2:#1e40af}body{font-family:Manrope,ui-sans-serif,sans-serif!important;background:linear-gradient(160deg,#fef3c7 0,#f7f8fc 46%,#dbeafe 100%)!important;color:var(--ui-text)!important}.wrap{max-width:1080px!important;margin:20px auto!important;padding:0 14px!important}.hero,.head,.title{gap:10px!important;align-items:flex-end!important}.box,.card,section.card{background:var(--ui-surface)!important;border:1px solid var(--ui-line)!important;border-radius:14px!important;padding:14px!important;box-shadow:0 10px 22px rgba(15,23,42,.06)!important}h1{font-size:32px!important;line-height:1.1!important;margin:0!important}h2,h3{letter-spacing:-.01em}p,small,.mini,.meta,.help,.sub{color:var(--ui-muted)!important}input,select,button{min-height:42px!important;padding:10px 12px!important;border-radius:10px!important;border:1px solid #c7d2e5!important}input:focus,select:focus{outline:2px solid #93c5fd!important;border-color:#93c5fd!important}button{font-weight:700!important;cursor:pointer!important;transition:transform .12s ease,box-shadow .12s ease!important}button:hover{transform:translateY(-1px)}button:not(.ghost):not(.btnGhost):not(.danger):not(.warn):not(.alt){background:linear-gradient(135deg,var(--ui-brand),var(--ui-brand-2))!important;color:#fff!important;border:0!important;box-shadow:0 8px 18px rgba(29,78,216,.22)!important}button.ghost,.btnGhost{background:#fff!important;color:#1e3a8a!important;border:1px solid #bfdbfe!important}ul{padding-left:0!important}ul li,.item{border-radius:12px!important}table{border-radius:10px;overflow:hidden}th,td{padding:10px 8px!important}@media(max-width:900px){.wrap{padding:0 12px!important}.row,.row2,.row4,.grid,.geo,.gridSession,.gridFav,.kpis,.kpi{grid-template-columns:1fr!important}.title h1,h1.title,.hero h1,h1{font-size:26px!important}}</style></head><body><div class="wrap"><div class="head"><div><h1 class="title">Agenda Service</h1><p class="sub">Administra sesiones y favoritos con un flujo mas claro para tu equipo.</p></div><button id="reload" class="btn btnGhost">Recargar</button></div><div class="stack"><section class="card"><div class="sectionBar"><h3>Nueva sesion</h3><span class="kpi">Paso 1 de 2</span></div><p class="help">Completa los datos principales y confirma para crear la sesion.</p><div class="gridSession"><input id="eventId" placeholder="ID del evento (ej. ev-2026-01)"><input id="title" placeholder="Titulo de la sesion"><input id="description" placeholder="Descripcion corta"><input id="startTime" type="datetime-local" title="Inicio"><input id="endTime" type="datetime-local" title="Fin"><input id="room" placeholder="Sala o escenario"><input id="capacity" type="number" placeholder="Capacidad" value="50"><button id="createSession" class="btn btnPrimary">Crear sesion</button></div></section><section class="card"><div class="sectionBar"><h3>Favoritos</h3><span class="kpi">Paso 2 de 2</span></div><p class="help">Asocia sesiones favoritas a un usuario para personalizar su agenda.</p><div class="gridFav"><input id="userId" placeholder="ID de usuario (ej. user-123)"><input id="sessionId" placeholder="ID de sesion"><button id="addFavorite" class="btn btnPrimary">Agregar favorito</button><button id="loadFavorites" class="btn btnGhost">Ver favoritos</button></div><ul id="favorites" class="list" style="margin-top:10px"></ul></section><section class="card"><div class="sectionBar"><h3>Sesiones</h3><span class="kpi" id="sessionCount">0 sesiones</span></div><ul id="sessions" class="list"></ul></section></div></div><script>async function loadSessions(){const r=await fetch('/agenda/sessions/data');const d=await r.json();const ul=document.getElementById('sessions');const count=document.getElementById('sessionCount');count.textContent=d.length+' sesiones';ul.innerHTML='';if(d.length===0){ul.innerHTML='<li class="empty">Aun no hay sesiones creadas.</li>';return;}d.forEach(s=>{const li=document.createElement('li');li.className='item';li.innerHTML='<div class="itemTop"><h4>'+s.title+'</h4><span class="badge">'+s.room+'</span></div><div class="meta">'+new Date(s.startTime).toLocaleString()+' - '+new Date(s.endTime).toLocaleString()+'</div><div class="desc">'+(s.description||'Sin descripcion')+'</div><div class="tiny">id: '+s.id+'</div>';ul.appendChild(li);});}async function loadFavorites(){const userId=document.getElementById('userId').value.trim();const ul=document.getElementById('favorites');if(!userId){ul.innerHTML='<li class="empty">Ingresa un userId para cargar favoritos.</li>';return;}const r=await fetch('/agenda/favorites/data/'+encodeURIComponent(userId));const d=await r.json();ul.innerHTML='';if(d.length===0){ul.innerHTML='<li class="empty">Sin favoritos para este usuario.</li>';return;}d.forEach(f=>{const li=document.createElement('li');li.className='item';li.innerHTML='<div class="itemTop"><strong>sessionId: '+f.sessionId+'</strong><span class="ok">activo</span></div><div class="tiny">creado: '+new Date(f.createdAt).toLocaleString()+'</div>';ul.appendChild(li);});}document.getElementById('createSession').onclick=async()=>{if(!confirm('Confirmar creacion de sesion?')){return;}const body={eventId:document.getElementById('eventId').value,title:document.getElementById('title').value,description:document.getElementById('description').value,startTime:document.getElementById('startTime').value,endTime:document.getElementById('endTime').value,room:document.getElementById('room').value,capacity:Number(document.getElementById('capacity').value||0),speakerName:''};await fetch('/agenda/sessions/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});loadSessions();};document.getElementById('addFavorite').onclick=async()=>{if(!confirm('Confirmar agregar favorito?')){return;}await fetch('/agenda/favorites/data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:document.getElementById('userId').value,sessionId:document.getElementById('sessionId').value})});loadFavorites();};document.getElementById('loadFavorites').onclick=loadFavorites;document.getElementById('reload').onclick=()=>{loadSessions();if(document.getElementById('userId').value){loadFavorites();}};loadSessions();setInterval(()=>{if(document.visibilityState==='visible'){loadSessions();if(document.getElementById('userId').value){loadFavorites();}}},15000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadSessions();if(document.getElementById('userId').value){loadFavorites();}}});</script></body></html>`;
  }

  @Get('health')
  status() {
    return { service: 'agenda-service', status: 'ok' };
  }

  @Post('sessions/data')
  async createSession(
    @Body()
    body: {
      eventId: string;
      title: string;
      description: string;
      startTime: string;
      endTime: string;
      room: string;
      capacity: number;
      speakerName: string;
    },
  ) {
    return await this.agendaService.createSession({
      ...body,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
    });
  }

  @Get('sessions/data')
  async listSessions(@Query('limit') limit?: string) {
    return await this.agendaService.listSessions(Number(limit ?? 50));
  }

  @Post('favorites/data')
  async addFavorite(@Body() body: { userId: string; sessionId: string }) {
    return await this.agendaService.addFavorite(body);
  }

  @Get('favorites/data/:userId')
  async listFavoritesByUser(@Param('userId') userId: string, @Query('limit') limit?: string) {
    return await this.agendaService.listFavoritesByUser(userId, Number(limit ?? 50));
  }

  @Get('summary/:userId')
  async summary(@Param('userId') userId: string) {
    return await this.agendaService.getSummary(userId);
  }
}
