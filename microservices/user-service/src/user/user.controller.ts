import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UnauthorizedException, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { CreateUserDto, ForgotPasswordDto, ResetPasswordDto, UpdateProfileDto, RequestPasswordChangeDto, ConfirmPasswordChangeDto } from './user.dto';
import { RoleGuard } from '../guards/role.guard';
import { Roles } from '../decorators/roles.decorator';

const refreshTokenByUserId = new Map<string, string>();

@Controller('users')
export class UserController {
	constructor(
		private readonly userService: UserService,
		private readonly jwtService: JwtService,
	) {}

  @Get('health')
  status() {
    return { service: 'user-service', status: 'ok' };
  }

	@Get()
	@Header('Content-Type', 'text/html; charset=utf-8')
	renderUi() {
    const baseUrl = String(process.env.APP_BASE_URL ?? '').trim().replace(/\/+$/, '');
  const targetUrl = baseUrl || 'http://localhost:3009';
    const normalizedTargetUrl = targetUrl === '/' ? targetUrl : `${targetUrl}/`;
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${normalizedTargetUrl}"><title>EventHive</title></head><body><script>window.location.replace('${normalizedTargetUrl}');</script></body></html>`;

		return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EventHive · Plataforma de Eventos</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --brand:#e85d04;--brand2:#dc2f02;--brand-glow:rgba(232,93,4,.32);
  --ink:#111827;--muted:#6b7280;--line:#e5e7eb;--surface:#ffffff;
  --radius:18px;--radius-sm:11px;--input-h:50px;
  --shadow:0 24px 64px rgba(0,0,0,.18),0 4px 16px rgba(0,0,0,.1);
}
body{
  font-family:Manrope,sans-serif;min-height:100vh;
  display:flex;align-items:center;justify-content:center;
  background:#0a0a14;
  background-image:url('https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1600&auto=format&fit=crop&q=80');
  background-size:cover;background-position:center;position:relative;
}
body::before{
  content:'';position:fixed;inset:0;
  background:linear-gradient(160deg,rgba(4,4,20,.88) 0%,rgba(8,8,28,.76) 55%,rgba(22,6,4,.88) 100%);
  backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
}
.page-tagline{
  position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
  color:rgba(255,255,255,.35);font-size:12px;letter-spacing:.04em;
  white-space:nowrap;z-index:0;
}
.card{
  position:relative;z-index:1;
  width:100%;max-width:448px;margin:20px;
  background:var(--surface);border-radius:var(--radius);
  box-shadow:var(--shadow);overflow:hidden;
}
.card.app-mode{
  width:min(1200px,96vw);
  max-width:min(1200px,96vw);
  height:min(860px,94vh);
  border-radius:20px;
  overflow:hidden;
  background:#f4f6fa;
}
.card-inner{padding:40px 38px 32px}
/* Logo */
.logo{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:6px}
.logo-text{font-size:26px;font-weight:800;letter-spacing:-.6px;color:var(--ink)}
.logo-text em{color:var(--brand);font-style:normal}
.tagline{text-align:center;color:var(--muted);font-size:13.5px;margin-bottom:30px;line-height:1.5}
/* Views */
.view{display:none}
.view.active{display:block;animation:fadeSlide .28s ease}
@keyframes fadeSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.view-title{font-size:22px;font-weight:800;color:var(--ink);text-align:center;margin-bottom:4px}
.view-sub{font-size:13px;color:var(--muted);text-align:center;margin-bottom:22px;line-height:1.55}
/* Fields */
.field{margin-bottom:14px}
.field label{display:block;font-size:11.5px;font-weight:700;color:var(--muted);margin-bottom:6px;letter-spacing:.05em;text-transform:uppercase}
.field-wrap{position:relative;display:flex;align-items:center}
.field-icon{position:absolute;left:14px;color:#9ca3af;pointer-events:none;display:flex;align-items:center;z-index:1}
.field input,.field select{
  width:100%;height:var(--input-h);padding:0 44px 0 44px;
  border:1.5px solid var(--line);border-radius:var(--radius-sm);
  font:inherit;font-size:15px;color:var(--ink);background:#f9fafb;
  transition:border-color .15s,background .15s,box-shadow .15s;
}
.field input:focus,.field select:focus{
  outline:none;border-color:var(--brand);background:#fff;
  box-shadow:0 0 0 3px var(--brand-glow);
}
.field select{-webkit-appearance:none;padding-right:14px}
.toggle-pw{
  position:absolute;right:12px;cursor:pointer;color:#9ca3af;
  background:none;border:none;padding:4px;display:flex;align-items:center;
  min-height:unset;height:auto;transition:color .15s;
}
.toggle-pw:hover{color:var(--brand)}
/* Primary button */
.btn-primary{
  width:100%;height:52px;border:none;border-radius:var(--radius-sm);
  background:linear-gradient(135deg,var(--brand) 0%,var(--brand2) 100%);
  color:#fff;font:inherit;font-size:15px;font-weight:700;
  cursor:pointer;letter-spacing:.02em;
  box-shadow:0 8px 22px var(--brand-glow);
  transition:transform .15s,box-shadow .15s,opacity .15s;
  margin-top:4px;
}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 14px 30px var(--brand-glow)}
.btn-primary:active{transform:translateY(0)}
.btn-primary:disabled{opacity:.5;cursor:not-allowed;transform:none!important;box-shadow:none!important}
/* Links */
.links{display:flex;justify-content:space-between;align-items:center;margin-top:18px;gap:8px;font-size:13px}
.links.center{justify-content:center}
.link{color:var(--brand);font-weight:600;cursor:pointer;text-decoration:none;background:none;border:none;font:inherit;font-size:13px;padding:0;transition:opacity .15s}
.link:hover{opacity:.75;text-decoration:underline}
/* Alert */
.alert{padding:11px 14px;border-radius:9px;font-size:13px;margin-bottom:14px;display:none;font-weight:500}
.alert.ok{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
.alert.err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.alert.info{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
.alert.show{display:block}
/* Divider */
.divider{display:flex;align-items:center;gap:10px;margin:16px 0;color:var(--muted);font-size:12px}
.divider::before,.divider::after{content:'';flex:1;height:1px;background:var(--line)}
/* Session app */
.app-shell{
  position:relative;z-index:2;
  width:min(1200px,96vw);
  height:min(860px,94vh);
  margin:16px auto;
  background:#f4f6fa;
  border-radius:20px;
  box-shadow:0 26px 66px rgba(0,0,0,.25);
  overflow:hidden;
  display:none;
  flex-direction:column;
}
.app-topbar{
  height:74px;
  background:#fff;
  border-bottom:1px solid #e6ebf2;
  display:grid;
  grid-template-columns:1fr auto 1fr;
  align-items:center;
  gap:12px;
  padding:0 18px;
}
.top-brand{display:flex;align-items:center;gap:10px;font-size:33px;font-weight:800;color:#111827;letter-spacing:-.03em}
.top-brand em{color:var(--brand);font-style:normal}
.top-nav{display:flex;align-items:center;gap:3px;justify-content:center}
.top-nav button{
  border:0;background:transparent;color:#4b5563;cursor:pointer;
  min-width:72px;height:52px;border-radius:12px;
  display:flex;flex-direction:column;justify-content:center;gap:3px;
  font-size:10.5px;font-weight:700;letter-spacing:.02em;
}
.top-nav button .ico{font-size:18px;line-height:1}
.top-nav button.active{color:#0f4cc9;background:#e8f0ff}
.top-nav button:hover{background:#f2f5fb}
.top-user{display:flex;align-items:center;justify-content:flex-end;gap:10px}
.role-pill{display:inline-block;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:800;text-transform:none;letter-spacing:.01em}
.role-pill.standard{background:#dbeafe;color:#1d4ed8}
.role-pill.admin{background:#ede9fe;color:#6d28d9}
.role-pill.guest{background:#f3f4f6;color:#374151}
.btn-mini{height:36px;padding:0 12px;border-radius:9px;border:1px solid #d4dbe8;background:#fff;cursor:pointer;font-size:12px;font-weight:700}
.btn-mini.logout{border-color:#fca5a5;color:#b91c1c}
.app-main{flex:1;overflow:auto;padding:18px}
.panel{display:none}
.panel.active{display:block;animation:fadeSlide .22s ease}
.app-main.service-mode{overflow:hidden}
.service-panel.active{display:flex;flex-direction:column;height:100%}
.service-embed{
  flex:1;min-height:640px;background:#fff;border:1px solid #e5e9f2;border-radius:16px;
  box-shadow:0 12px 28px rgba(17,24,39,.08);overflow:hidden;display:flex;flex-direction:column;
}
.service-embed-bar{
  display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;
  border-bottom:1px solid #e5e9f2;background:#f8fafc;color:#475569;font-size:12px;font-weight:700;
}
.service-embed-bar button{
  border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:8px 10px;cursor:pointer;
  font:inherit;font-size:12px;font-weight:800;color:#1e3a8a;
}
.service-embed-frame{flex:1;width:100%;border:0;background:#fff}
.hero{
  background:linear-gradient(135deg,#121a35 0%,#1e274d 45%,#4a1d10 100%);
  border-radius:16px;color:#fff;padding:20px 22px;
  box-shadow:0 12px 28px rgba(17,24,39,.25);
}
.hero h2{font-size:27px;letter-spacing:-.02em;margin-bottom:4px}
.hero p{opacity:.82;font-size:14px}
.grid-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:14px}
.panel-card{
  background:#fff;border:1px solid #e5e9f2;border-radius:14px;padding:14px;
  min-height:120px;display:flex;flex-direction:column;justify-content:space-between;
}
.panel-card .head{display:flex;align-items:center;gap:8px;font-weight:800;color:#111827}
.panel-card .head .ico{font-size:18px}
.panel-card p{color:#5b6475;font-size:13px;line-height:1.45;margin-top:8px}
.panel-card .cta{margin-top:12px;border:0;background:#eff4ff;color:#1542af;padding:8px 10px;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;text-align:left}
.muted-box{margin-top:14px;background:#fff;border:1px dashed #ccd5e7;border-radius:12px;padding:12px;color:#5b6475;font-size:13px}
.admin-only,.standard-only,.guest-only{display:none}
@media(max-width:480px){
  .card-inner{padding-left:22px;padding-right:22px}
  .links{flex-direction:column;gap:10px;text-align:center}
}
@media(max-width:1020px){
  .app-topbar{grid-template-columns:1fr;gap:8px;height:auto;padding:12px}
  .top-brand{justify-content:center;font-size:28px}
  .top-nav{justify-content:center;flex-wrap:wrap}
  .top-user{justify-content:center;flex-wrap:wrap}
  .grid-cards{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:680px){
  .grid-cards{grid-template-columns:1fr}
}
</style>
</head>
<body>

<div class="card" id="card">
  <!-- Card principal (login / registro / forgot) -->
  <div class="card-inner" id="cardInner">
    <!-- Logo -->
    <div class="logo">
      <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
        <path d="M20 3L35.6 12V28L20 37L4.4 28V12L20 3Z" fill="#e85d04" opacity=".12" stroke="#e85d04" stroke-width="1.6"/>
        <path d="M13 19l5 5 9-9" stroke="#e85d04" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="logo-text">Event<em>Hive</em></span>
    </div>
    <p class="tagline">La plataforma inteligente para gestión de eventos profesionales</p>

    <!-- LOGIN -->
    <div class="view active" id="vLogin">
      <h2 class="view-title">Bienvenido de nuevo</h2>
      <p class="view-sub">Accede a tu cuenta y gestiona todos tus eventos desde un solo lugar</p>
      <div id="alertLogin" class="alert"></div>
      <div class="field">
        <label>Correo Electrónico</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg></span>
          <input id="loginEmail" type="email" placeholder="ejemplo@correo.com" autocomplete="email">
        </div>
      </div>
      <div class="field">
        <label>Contraseña</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
          <input id="loginPw" type="password" placeholder="••••••••" autocomplete="current-password">
          <button type="button" class="toggle-pw" id="tpLogin" onclick="togglePw('loginPw','tpLogin')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <button class="btn-primary" id="loginBtn" onclick="doLogin()">Iniciar sesión</button>
      <div class="links">
        <button class="link" onclick="showView('vForgot')">¿Olvidaste tu contraseña?</button>
        <button class="link" onclick="showView('vRegister')">Crear cuenta →</button>
      </div>
    </div>

    <!-- REGISTRO -->
    <div class="view" id="vRegister">
      <h2 class="view-title">Crea tu cuenta</h2>
      <p class="view-sub">Únete a EventHive y empieza a organizar eventos extraordinarios</p>
      <div id="alertReg" class="alert"></div>
      <div class="field">
        <label>Nombre completo</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></span>
          <input id="regName" type="text" placeholder="Juan García" autocomplete="name">
        </div>
      </div>
      <div class="field">
        <label>Correo Electrónico</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg></span>
          <input id="regEmail" type="email" placeholder="ejemplo@correo.com" autocomplete="email">
        </div>
      </div>
      <div class="field">
        <label>Contraseña</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
          <input id="regPw" type="password" placeholder="Mín. 8 caracteres" autocomplete="new-password">
          <button type="button" class="toggle-pw" id="tpReg" onclick="togglePw('regPw','tpReg')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label>Tipo de cuenta</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
          <select id="regType">
            <option value="standard">Participante</option>
            <option value="admin">Organizador</option>
            <option value="guest">Invitado</option>
          </select>
        </div>
      </div>
      <button class="btn-primary" id="regBtn" onclick="doRegister()">Registrarme en EventHive</button>
      <div class="links center">
        <button class="link" onclick="showView('vLogin')">← Ya tengo una cuenta</button>
      </div>
    </div>

    <!-- RECUPERAR CONTRASEÑA -->
    <div class="view" id="vForgot">
      <h2 class="view-title">Recuperar contraseña</h2>
      <p class="view-sub">Ingresa tu correo y te enviaremos las instrucciones para recuperar el acceso</p>
      <div id="alertForgot" class="alert"></div>
      <div class="field">
        <label>Correo Electrónico</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg></span>
          <input id="forgotEmail" type="email" placeholder="ejemplo@correo.com" autocomplete="email">
        </div>
      </div>
      <button class="btn-primary" onclick="doForgot()">Enviar instrucciones de recuperación</button>
      <div class="links center">
        <button class="link" onclick="showView('vLogin')">← Volver al inicio de sesión</button>
      </div>
    </div>

    <!-- RESTABLECER CONTRASEÑA -->
    <div class="view" id="vReset">
      <h2 class="view-title">Nueva contraseña</h2>
      <p class="view-sub">Ingresa una nueva contraseña para completar el restablecimiento de tu cuenta</p>
      <div id="alertReset" class="alert"></div>
      <div class="field">
        <label>Nueva contraseña</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
          <input id="resetPw" type="password" placeholder="Mín. 8 caracteres" autocomplete="new-password">
          <button type="button" class="toggle-pw" id="tpReset" onclick="togglePw('resetPw','tpReset')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <div class="field">
        <label>Confirmar contraseña</label>
        <div class="field-wrap">
          <span class="field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
          <input id="resetPwConfirm" type="password" placeholder="Repite la contrasena" autocomplete="new-password">
        </div>
      </div>
      <button class="btn-primary" id="resetBtn" onclick="doResetPassword()">Guardar nueva contraseña</button>
      <div class="links center">
        <button class="link" onclick="showView('vLogin')">← Volver al inicio de sesión</button>
      </div>
    </div>

  </div><!-- /card-inner -->

  <!-- SESION ACTIVA -->
  <div id="vSession" class="app-shell">
    <header class="app-topbar">
      <div class="top-brand">Event<em>Hive</em></div>
      <nav class="top-nav">
        <button id="tabInicio" class="active" onclick="switchPanel('inicio', this)"><span class="ico">🏠</span><span>Inicio</span></button>
        <button id="tabEventos" onclick="switchPanel('eventos', this)"><span class="ico">📅</span><span>Eventos</span></button>
        <button id="tabTickets" data-roles="standard,admin" onclick="switchPanel('tickets', this)"><span class="ico">🎫</span><span>Tickets</span></button>
        <button id="tabCredencial" data-roles="standard,admin" onclick="switchPanel('credencial', this)"><span class="ico">🔐</span><span>Credencial</span></button>
        <button id="tabAgenda" data-roles="standard,admin" onclick="switchPanel('agenda', this)"><span class="ico">📆</span><span>Agenda</span></button>
        <button id="tabNotifs" data-roles="standard,admin" onclick="switchPanel('notificaciones', this)"><span class="ico">🔔</span><span>Avisos</span></button>
        <button id="tabAnalytica" data-roles="admin" onclick="switchPanel('analytica', this)"><span class="ico">📊</span><span>Analítica</span></button>
        <button id="tabAdmin" data-roles="admin" onclick="switchPanel('admin', this)"><span class="ico">🛠️</span><span>Admin</span></button>
      </nav>
      <div class="top-user">
        <span id="sessRole" class="role-pill"></span>
        <button class="btn-mini" id="copyTokenPanel" onclick="copyToken()">Copiar token</button>
        <button class="btn-mini logout" onclick="doLogout()">Cerrar sesion</button>
      </div>
    </header>

    <main class="app-main" id="appMain">
      <section id="panel-inicio" class="panel active">
        <div class="hero">
          <h2 id="sessGreet">Hola</h2>
          <p id="sessEmail"></p>
        </div>
        <div class="grid-cards">
          <article class="panel-card">
            <div class="head"><span class="ico">👤</span><span>Cuenta</span></div>
            <p>Tu identificador es <strong id="sessId"></strong>.</p>
            <button class="cta" onclick="switchPanel('notificaciones', document.getElementById('tabNotifs'))">Ver notificaciones</button>
          </article>
          <article class="panel-card standard-only" data-role-group="buyer">
            <div class="head"><span class="ico">🎟️</span><span>Administracion de tickets</span></div>
            <p>Accede al panel de tickets para gestionar catalogo, disponibilidad y cambios del evento.</p>
            <button class="cta" onclick="switchPanel('tickets', document.getElementById('tabTickets'))">Abrir tickets</button>
          </article>
          <article class="panel-card admin-only">
            <div class="head"><span class="ico">📊</span><span>Analitica</span></div>
            <p>Consulta ventas, asistencia y metricas del evento desde el panel de analitica.</p>
            <button class="cta" onclick="switchPanel('analytica', document.getElementById('tabAnalytica'))">Abrir analitica</button>
          </article>
          <article class="panel-card guest-only">
            <div class="head"><span class="ico">👀</span><span>Modo invitado</span></div>
            <p>Acceso de lectura. Explora eventos disponibles y regístrate para acceder a tickets, agenda y más.</p>
            <button class="cta" onclick="switchPanel('eventos', document.getElementById('tabEventos'))">Explorar eventos</button>
          </article>
        </div>
      </section>

      <section id="panel-eventos" class="panel service-panel">
        <div class="service-embed">
          <div class="service-embed-bar">
            <span></span>
            <button onclick="openService('event','/events')">Abrir en pestaña</button>
          </div>
          <iframe id="eventFrame" class="service-embed-frame" title="Event Service"></iframe>
        </div>
      </section>

      <section id="panel-tickets" class="panel service-panel">
        <div class="service-embed">
          <div class="service-embed-bar">
            <span>Ticketing Service cargado dentro del panel principal.</span>
            <button onclick="openService('ticketing','/tickets')">Abrir aparte</button>
          </div>
          <iframe id="ticketingFrame" class="service-embed-frame" title="Ticketing Service"></iframe>
        </div>
      </section>

      <section id="panel-credencial" class="panel">
        <div class="hero"><h2>Credenciales Digitales</h2><p>Tus códigos QR de acceso y validación de entrada al evento.</p></div>
        <div class="grid-cards">
          <article class="panel-card"><div class="head"><span class="ico">🔐</span><span>Mi QR de acceso</span></div><p>Consulta y descarga tu credencial digital generada despues de la compra.</p><button class="cta" onclick="openService('credential','/credentials/client')">Ver credencial</button></article>
          <article class="panel-card standard-only"><div class="head"><span class="ico">📋</span><span>Mis entradas</span></div><p>Revisa todas las entradas vinculadas a tu cuenta.</p><button class="cta" onclick="openService('ticketing','/tickets')">Ver entradas</button></article>
          <article class="panel-card admin-only"><div class="head"><span class="ico">📷</span><span>Validar en puerta</span></div><p>Escanea y valida credenciales en tiempo real desde la vista de staff.</p><button class="cta" onclick="openService('credential','/credentials/staff')">Validar acceso</button></article>
        </div>
      </section>

      <section id="panel-agenda" class="panel">
        <div class="hero"><h2>Agenda</h2><p>Programación de sesiones, talleres y ponentes del evento.</p></div>
        <div class="grid-cards">
          <article class="panel-card"><div class="head"><span class="ico">📆</span><span>Programación</span></div><p>Consulta todas las sesiones y horarios del evento.</p><button class="cta" onclick="openService('agenda','/agenda')">Ver agenda</button></article>
          <article class="panel-card standard-only"><div class="head"><span class="ico">⭐</span><span>Mis favoritos</span></div><p>Sesiones marcadas para construir tu agenda personalizada.</p><button class="cta" onclick="openService('agenda','/agenda/favorites')">Ver favoritos</button></article>
          <article class="panel-card admin-only"><div class="head"><span class="ico">🧩</span><span>Gestionar sesiones</span></div><p>Crea y edita sesiones, asigna salas y ponentes.</p><button class="cta" onclick="openService('agenda','/agenda')">Administrar agenda</button></article>
        </div>
      </section>

      <section id="panel-notificaciones" class="panel">
        <div class="hero"><h2>Notificaciones</h2><p>Comunicacion centralizada para usuarios y asistentes.</p></div>
        <div class="grid-cards">
          <article class="panel-card"><div class="head"><span class="ico">📩</span><span>Bandeja</span></div><p>Visualiza mensajes pendientes y recientes.</p><button class="cta" onclick="openService('notification','/notifications')">Abrir notification-service</button></article>
          <article class="panel-card admin-only"><div class="head"><span class="ico">📣</span><span>Difusion masiva</span></div><p>Envia avisos globales a todos los usuarios.</p><button class="cta" onclick="openService('notification','/notifications')">Crear aviso</button></article>
          <article class="panel-card"><div class="head"><span class="ico">⚙️</span><span>Preferencias</span></div><p>Configura tipos de alertas y recordatorios.</p><button class="cta" onclick="openService('mobile','/mobile')">Configurar</button></article>
        </div>
      </section>

      <section id="panel-analytica" class="panel">
        <div class="hero"><h2>Analítica y Reportes</h2><p>Métricas de ventas, asistencia y perfil demográfico en tiempo real.</p></div>
        <div class="grid-cards admin-only">
          <article class="panel-card"><div class="head"><span class="ico">💰</span><span>Ventas en tiempo real</span></div><p>Ingresos totales, volumen de entradas y tasa de conversión por evento.</p><button class="cta" onclick="openService('analytics','/analytics/sales')">Ver ventas</button></article>
          <article class="panel-card"><div class="head"><span class="ico">👥</span><span>Aforo y asistencia</span></div><p>Check-ins en vivo y ocupación por sesión o sala.</p><button class="cta" onclick="openService('analytics','/analytics/attendance')">Ver asistencia</button></article>
          <article class="panel-card"><div class="head"><span class="ico">📊</span><span>Perfil demográfico</span></div><p>Ubicación, tipo de entrada y segmentación de asistentes del evento.</p><button class="cta" onclick="openService('analytics','/analytics/summary')">Ver reportes</button></article>
        </div>
      </section>

      <section id="panel-admin" class="panel">
        <div class="hero"><h2>Panel Administrativo</h2><p>Solo administradores: operacion integral de microservicios.</p></div>
        <div class="grid-cards admin-only">
          <article class="panel-card"><div class="head"><span class="ico">👥</span><span>Usuarios</span></div><p>Alta, baja y modificacion de cuentas.</p><button class="cta" onclick="openService('user','/users/data')">Abrir user-service</button></article>
          <article class="panel-card"><div class="head"><span class="ico">🧩</span><span>Gateway</span></div><p>Orquestacion de servicios y dashboard consolidado.</p><button class="cta" onclick="openService('gateway','/gateway')">Abrir api-gateway</button></article>
          <article class="panel-card"><div class="head"><span class="ico">📉</span><span>Metricas</span></div><p>Estado de negocio y rendimiento del sistema.</p><button class="cta" onclick="openService('analytics','/analytics/summary')">Abrir analytics-service</button></article>
        </div>
        <div class="muted-box admin-only">Tip: este panel puede conectarse luego con endpoints protegidos por rol para acciones reales.</div>
      </section>
    </main>
  </div>

</div><!-- /card -->

<p class="page-tagline">EventHive · Plataforma integral de gestión de eventos</p>

<script>
let _token = '', _refreshToken = '', _user = null;
let _sessionTimer = null;
let _refreshInFlight = null;
const _host = window.location.hostname || 'localhost';
const _origin = window.location.origin || ('http://' + _host + (window.location.port ? ':' + window.location.port : ''));
const _isLocalHost = _host === 'localhost' || _host === '127.0.0.1';
const _gatewayOrigin = _isLocalHost && window.location.port && window.location.port !== '3008'
  ? ('http://' + _host + ':3008')
  : _origin;
const _storageKeys = {
  token: 'eventhive.session.token',
  refreshToken: 'eventhive.session.refreshToken',
  user: 'eventhive.session.user',
  expiresAt: 'eventhive.session.expiresAt',
  lastPanel: 'eventhive.session.lastPanel',
};
const _services = {
  user: _origin,
  event: _gatewayOrigin,
  ticketing: _gatewayOrigin,
  notification: _gatewayOrigin,
  credential: _gatewayOrigin,
  agenda: _gatewayOrigin,
  analytics: _gatewayOrigin,
  mobile: _gatewayOrigin,
  gateway: _gatewayOrigin,
};

function gatewayUrl(path) {
  return _gatewayOrigin + path;
}

function openService(service, path) {
  const base = _services[service];
  if (!base) return;
  let targetPath = path || '';
  if (service === 'ticketing') {
    const effectiveRole = normalizeRole((_user && _user.accountType) || 'guest');
    targetPath = effectiveRole === 'admin' ? '/tickets/organizer' : '/tickets/client';
  }

  const url = new URL(base + targetPath);
  if (service === 'ticketing' && _token) {
    url.hash = 'token=' + encodeURIComponent(_token);
    if (_refreshToken) {
      url.hash += '&refreshToken=' + encodeURIComponent(_refreshToken);
    }
  }

  window.open(url.toString(), '_blank', 'noopener');
}

function clearSessionStorage() {
  localStorage.removeItem(_storageKeys.token);
  localStorage.removeItem(_storageKeys.refreshToken);
  localStorage.removeItem(_storageKeys.user);
  localStorage.removeItem(_storageKeys.expiresAt);
  localStorage.removeItem(_storageKeys.lastPanel);
}

function stopSessionWatcher() {
  if (_sessionTimer) {
    clearInterval(_sessionTimer);
    _sessionTimer = null;
  }
}

function decodeJwtPayload(rawToken) {
  try {
    const payload = rawToken.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

function getTokenExpiry(rawToken) {
  const payload = decodeJwtPayload(rawToken);
  return Number(payload && payload.exp ? payload.exp * 1000 : 0);
}

function pushSessionToEmbeddedServices() {
  const ticketingFrame = document.getElementById('ticketingFrame');
  const eventFrame = document.getElementById('eventFrame');
  if (!_token) {
    return;
  }

  [ticketingFrame, eventFrame].forEach(function(frame) {
    if (!frame || !frame.contentWindow) {
      return;
    }
    frame.contentWindow.postMessage({
      type: 'eventhive:session',
      token: _token,
      refreshToken: _refreshToken,
      user: _user,
    }, '*');
  });
}

function replySessionToTarget(targetWindow) {
  if (!targetWindow || !_token) {
    return;
  }

  try {
    targetWindow.postMessage({
      type: 'eventhive:session',
      token: _token,
      refreshToken: _refreshToken,
      user: _user,
    }, '*');
  } catch {}
}

async function refreshSession(preferredPanelName) {
  if (!_refreshToken) {
    throw new Error('No hay refresh token disponible');
  }

  if (_refreshInFlight) {
    return _refreshInFlight;
  }

  _refreshInFlight = (async function() {
    const r = await fetch('/users/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    });
    const d = await r.json().catch(function(){ return {}; });
    if (!r.ok || !d.accessToken) {
      throw new Error(d.message || 'No se pudo renovar la sesión');
    }

    _token = d.accessToken;
    if (d.refreshToken) {
      _refreshToken = d.refreshToken;
    }
    saveSessionState(preferredPanelName || localStorage.getItem(_storageKeys.lastPanel) || 'inicio');
    pushSessionToEmbeddedServices();
    return _token;
  })().finally(function() {
    _refreshInFlight = null;
  });

  return _refreshInFlight;
}

function startSessionWatcher() {
  stopSessionWatcher();
  _sessionTimer = setInterval(async function () {
    if (!_token) {
      return;
    }
    const expiresAtRaw = localStorage.getItem(_storageKeys.expiresAt);
    const expiresAt = Number(expiresAtRaw || '0');
    if (!expiresAt) {
      return;
    }

    if (Date.now() >= expiresAt - 60000) {
      try {
        await refreshSession(localStorage.getItem(_storageKeys.lastPanel) || 'inicio');
      } catch {
        doLogout('expired');
      }
    }
  }, 30000);
}

function normalizeRole(role) {
  const normalized = String(role || 'guest').trim().toLowerCase();
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

function isPanelAllowed(panelName, role) {
  role = normalizeRole(role);
  if (!panelName) return false;
  if ((panelName === 'admin' || panelName === 'analytica') && role !== 'admin') return false;
  if (['tickets','credencial','agenda','notificaciones'].includes(panelName) && role === 'guest') return false;
  return Boolean(document.getElementById('panel-' + panelName));
}

function tabIdForPanel(panelName) {
  const tabMap = {
    inicio: 'tabInicio',
    eventos: 'tabEventos',
    tickets: 'tabTickets',
    credencial: 'tabCredencial',
    agenda: 'tabAgenda',
    notificaciones: 'tabNotifs',
    analytica: 'tabAnalytica',
    admin: 'tabAdmin',
  };
  return tabMap[panelName] || 'tabInicio';
}

function saveSessionState(lastPanelName) {
  if (!_token || !_user) return;
  const expiresAt = getTokenExpiry(_token) || (Date.now() + 55 * 60 * 1000);
  localStorage.setItem(_storageKeys.token, _token);
  localStorage.setItem(_storageKeys.refreshToken, _refreshToken || '');
  localStorage.setItem(_storageKeys.user, JSON.stringify(_user));
  localStorage.setItem(_storageKeys.expiresAt, String(expiresAt));
  localStorage.setItem(_storageKeys.lastPanel, lastPanelName || 'inicio');
}

function restoreSessionState() {
  const token = localStorage.getItem(_storageKeys.token);
  const refreshToken = localStorage.getItem(_storageKeys.refreshToken);
  const userRaw = localStorage.getItem(_storageKeys.user);
  const expiresAtRaw = localStorage.getItem(_storageKeys.expiresAt);
  const lastPanel = localStorage.getItem(_storageKeys.lastPanel) || 'inicio';

  if (!token || !userRaw || !expiresAtRaw) {
    clearSessionStorage();
    return false;
  }

  const expiresAt = Number(expiresAtRaw);
  if (!expiresAt || Date.now() > expiresAt) {
    if (!refreshToken) {
      clearSessionStorage();
      setAlert('alertLogin', 'La sesion expiro. Inicia sesion nuevamente.', 'info');
      return false;
    }
  }

  try {
    _user = JSON.parse(userRaw);
    _token = token;
    _refreshToken = refreshToken || '';
  } catch {
    clearSessionStorage();
    return false;
  }

  if (!expiresAt || Date.now() > expiresAt) {
    refreshSession(lastPanel)
      .then(function() {
        showSession(lastPanel);
        startSessionWatcher();
      })
      .catch(function() {
        clearSessionStorage();
        setAlert('alertLogin', 'La sesion expiro. Inicia sesion nuevamente.', 'info');
      });
    return true;
  }

  showSession(lastPanel);
  startSessionWatcher();
  return true;
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const v = document.getElementById(id);
  if (v) { v.classList.add('active'); }
  ['alertLogin','alertReg','alertForgot','alertReset'].forEach(function(aid){ setAlert(aid,'',''); });
}

function setAlert(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'alert' + (msg ? (' show ' + type) : '');
}

const eyeOpen = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeOff  = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

function togglePw(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const isText = inp.type === 'text';
  inp.type = isText ? 'password' : 'text';
  btn.innerHTML = isText ? eyeOpen : eyeOff;
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw    = document.getElementById('loginPw').value;
  if (!email || !pw) { setAlert('alertLogin','Por favor completa todos los campos','err'); return; }
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Verificando...';
  try {
    const r = await fetch('/users/auth/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email: email, password: pw})
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Credenciales incorrectas');
    _token = d.accessToken; _refreshToken = d.refreshToken || ''; _user = d.user;
    saveSessionState('inicio');
    showSession('inicio');
    startSessionWatcher();
  } catch(e) {
    setAlert('alertLogin', e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Iniciar sesion';
  }
}

async function doRegister() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pw    = document.getElementById('regPw').value;
  const type  = document.getElementById('regType').value;
  if (!name || !email || !pw) { setAlert('alertReg','Por favor completa todos los campos','err'); return; }
  if (pw.length < 8) { setAlert('alertReg','La contraseÃ±a debe tener mÃ­nimo 8 caracteres','err'); return; }
  const btn = document.getElementById('regBtn');
  btn.disabled = true; btn.textContent = 'Creando cuenta...';
  try {
    const r = await fetch('/users/data', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name: name, email: email, password: pw, accountType: type})
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'No se pudo crear la cuenta');
    const preview = d.confirmationPreviewUrl ? ' En este entorno no hay SMTP configurado, asÃ­ que puedes abrir el enlace de confirmaciÃ³n manual: ' + d.confirmationPreviewUrl : '';
    setAlert('alertReg', 'Cuenta creada. Revisa tu correo para activarla antes de iniciar sesiÃ³n.' + preview, 'ok');
    setTimeout(function(){ showView('vLogin'); }, 2600);
  } catch(e) {
    setAlert('alertReg', e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Registrarme en EventHive';
  }
}

function doForgot() {
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) { setAlert('alertForgot','Ingresa tu correo electrÃ³nico','err'); return; }
  fetch('/users/auth/forgot-password', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ email: email })
  })
    .then(async function(r){
      const d = await r.json().catch(function(){ return {}; });
      if (!r.ok) throw new Error(d.message || 'No se pudo iniciar el restablecimiento');
      const preview = d.resetPreviewUrl ? ' En este entorno no hay SMTP configurado, asÃ­ que puedes abrir manualmente: ' + d.resetPreviewUrl : '';
      setAlert('alertForgot', 'Si esa cuenta existe, recibirÃ¡s las instrucciones en tu bandeja de entrada en los prÃ³ximos minutos.' + preview, 'ok');
    })
    .catch(function(error){
      setAlert('alertForgot', error.message, 'err');
    });
}

async function doResetPassword() {
  const token = getParam('resetToken');
  const password = document.getElementById('resetPw').value;
  const confirm = document.getElementById('resetPwConfirm').value;
  if (!token) { setAlert('alertReset','El enlace de recuperaciÃ³n no es vÃ¡lido.','err'); return; }
  if (!password || password.length < 8) { setAlert('alertReset','La contrasena debe tener mÃ­nimo 8 caracteres','err'); return; }
  if (password !== confirm) { setAlert('alertReset','Las contraseÃ±as no coinciden','err'); return; }

  const btn = document.getElementById('resetBtn');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    const r = await fetch('/users/auth/reset-password', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ token: token, password: password })
    });
    const d = await r.json().catch(function(){ return {}; });
    if (!r.ok) throw new Error(d.message || 'No se pudo restablecer la contrasena');
    setAlert('alertLogin', 'Contrasena actualizada correctamente. Ya puedes iniciar sesiÃ³n.', 'ok');
    window.history.replaceState({}, '', '/users');
    showView('vLogin');
  } catch (e) {
    setAlert('alertReset', e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar nueva contrasena';
  }
}

function applyRoleInterface(role) {
  const effectiveRole = normalizeRole(role || 'guest');
  document.querySelectorAll('[data-roles]').forEach(function(node) {
    const roles = (node.getAttribute('data-roles') || '').split(',').map(function(r){ return r.trim(); });
    node.style.display = roles.includes(effectiveRole) ? '' : 'none';
  });

  document.querySelectorAll('.admin-only').forEach(function(node){
    node.style.display = effectiveRole === 'admin' ? '' : 'none';
  });
  document.querySelectorAll('.standard-only').forEach(function(node){
    node.style.display = (effectiveRole === 'standard' || effectiveRole === 'admin') ? '' : 'none';
  });
  document.querySelectorAll('.guest-only').forEach(function(node){
    node.style.display = effectiveRole === 'guest' ? '' : 'none';
  });

  if (effectiveRole !== 'admin' && (document.getElementById('panel-admin').classList.contains('active') || document.getElementById('panel-analytica').classList.contains('active'))) {
    switchPanel('inicio', document.getElementById('tabInicio'));
  }
}

function switchPanel(name, tabButton) {
  document.querySelectorAll('.panel').forEach(function(panel){ panel.classList.remove('active'); });
  document.querySelectorAll('.top-nav button').forEach(function(btn){ btn.classList.remove('active'); });
  document.getElementById('appMain').classList.toggle('service-mode', name === 'tickets' || name === 'eventos');

  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');
  if (tabButton) tabButton.classList.add('active');

  if (name === 'tickets') {
    const effectiveRole = normalizeRole((_user && _user.accountType) || 'guest');
    const ticketingPath = effectiveRole === 'admin' ? '/tickets/organizer' : '/tickets/client';
    ensureEmbeddedService('ticketingFrame', 'ticketing', ticketingPath);
  }

  if (name === 'eventos') {
    ensureEmbeddedService('eventFrame', 'event', '/events');
  }

  if (_token && _user && panel) {
    localStorage.setItem(_storageKeys.lastPanel, name);
  }
}

function ensureEmbeddedService(frameId, service, path) {
  const frame = document.getElementById(frameId);
  const base = _services[service];
  if (!frame || !base) return;
  const targetUrl = base + (path || '');
  if (frame.dataset.loadedUrl === targetUrl) {
    // Already loaded — re-send token in case iframe re-rendered
    if (_token) {
      replySessionToTarget(frame.contentWindow);
    }
    return;
  }
  frame.src = targetUrl;
  frame.dataset.loadedUrl = targetUrl;
  frame.onload = function() {
    if (_token) {
      replySessionToTarget(frame.contentWindow);
    }
  };
}

window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'eventhive:request-session') {
    replySessionToTarget(event.source);
  }
});

function showSession(preferredPanel) {
  const card = document.getElementById('card');
  card.classList.add('app-mode');
  document.getElementById('cardInner').style.display = 'none';
  const shell = document.getElementById('vSession');
  shell.style.display = 'flex';

  const displayName = (_user.name || '').trim() || ((_user.email || '').split('@')[0] || 'usuario');
  document.getElementById('sessGreet').textContent = 'Hola, ' + displayName + '!';
  document.getElementById('sessEmail').textContent = _user.email;
  document.getElementById('sessId').textContent = _user.id;

  const role = normalizeRole(_user.accountType || 'guest');
  _user.accountType = role;
  const roleEl = document.getElementById('sessRole');
  roleEl.textContent = roleLabel(role);
  roleEl.className = 'role-pill ' + role;

  applyRoleInterface(role);
  const targetPanel = isPanelAllowed(preferredPanel || 'inicio', role) ? (preferredPanel || 'inicio') : 'inicio';
  switchPanel(targetPanel, document.getElementById(tabIdForPanel(targetPanel)));
}

function doLogout(reason) {
  _token = ''; _refreshToken = ''; _user = null;
  stopSessionWatcher();
  clearSessionStorage();
  const card = document.getElementById('card');
  card.classList.remove('app-mode');
  document.getElementById('vSession').style.display = 'none';
  document.getElementById('cardInner').style.display = 'block';
  showView('vLogin');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPw').value = '';
  if (reason === 'expired') {
    setAlert('alertLogin', 'La sesion expiro. Inicia sesion nuevamente.', 'info');
  }
}

function copyToken() {
  if (!_token) return;
  navigator.clipboard.writeText(_token).then(function(){
    const btn = document.getElementById('copyTokenPanel');
    if (!btn) return;
    btn.textContent = 'Copiado';
    setTimeout(function(){ btn.textContent = 'Copiar token'; }, 1500);
  });
}

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  if (document.getElementById('vLogin').classList.contains('active'))    doLogin();
  else if (document.getElementById('vRegister').classList.contains('active')) doRegister();
  else if (document.getElementById('vForgot').classList.contains('active'))   doForgot();
});

const confirmed = getParam('confirmed');
const resetToken = getParam('resetToken');
if (confirmed === '1') {
  showView('vLogin');
  setAlert('alertLogin', 'Correo confirmado correctamente. Ya puedes iniciar sesiÃ³n.', 'ok');
} else if (confirmed === 'expired') {
  showView('vLogin');
  setAlert('alertLogin', 'El enlace de confirmaciÃ³n expirÃ³. Debes solicitar uno nuevo.', 'err');
} else if (confirmed === 'invalid') {
  showView('vLogin');
  setAlert('alertLogin', 'El enlace de confirmaciÃ³n no es vÃ¡lido.', 'err');
} else if (resetToken) {
  showView('vReset');
} else {
  showView('vLogin');
  restoreSessionState();
}

// === Ticketing Service Integration ===
async function loadTicketSummary() {
  if (_user.accountType !== 'admin') return;
  try {
    const r = await fetch(gatewayUrl('/tickets/orders/summary'), {
      headers: { 'Authorization': 'Bearer ' + _token }
    });
    const data = await r.json();
    document.getElementById('ticketingSummaryOrders').textContent = data.totalOrders || 0;
    document.getElementById('ticketingSummaryRevenue').textContent = (data.totalRevenue || 0).toFixed(2);
    document.getElementById('ticketingSummaryPaid').textContent = data.paidCount || 0;
  } catch (e) {
    console.error('Error loading ticket summary:', e);
  }
}

async function loadMyOrders() {
  if (!_user || !_token) return;
  try {
    const url = gatewayUrl('/tickets/orders?userId=' + encodeURIComponent(_user.id) + '&limit=20');
    const r = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + _token }
    });
    const orders = await r.json();
    const detail = document.getElementById('ticketingDetailView');
    const detailTitle = document.getElementById('ticketingDetailTitle');
    const detailContent = document.getElementById('ticketingDetailContent');
    
    detailTitle.textContent = 'Mis órdenes (' + (orders.length || 0) + ')';
    if (!orders || orders.length === 0) {
      detailContent.innerHTML = '<p style="color:#5b6475">No hay órdenes registradas.</p>';
    } else {
      let html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f0f4ff"><th style="padding:8px;text-align:left;font-weight:700;border:1px solid #e5e9f2">ID</th><th style="padding:8px;text-align:left;font-weight:700;border:1px solid #e5e9f2">Monto</th><th style="padding:8px;text-align:left;font-weight:700;border:1px solid #e5e9f2">Estado</th><th style="padding:8px;text-align:left;font-weight:700;border:1px solid #e5e9f2">Proveedor</th></tr></thead><tbody>';
      orders.forEach(function(o) {
        html += '<tr><td style="padding:8px;border:1px solid #e5e9f2;font-size:12px">' + (o.id || '-').substring(0,8) + '...</td><td style="padding:8px;border:1px solid #e5e9f2">$' + (o.totalAmount || 0).toFixed(2) + '</td><td style="padding:8px;border:1px solid #e5e9f2"><span style="padding:2px 6px;border-radius:4px;background:#e8f5e9;color:#2e7d32;font-size:11px">' + (o.status || 'unknown') + '</span></td><td style="padding:8px;border:1px solid #e5e9f2">' + (o.provider || '-') + '</td></tr>';
      });
      html += '</tbody></table>';
      detailContent.innerHTML = html;
    }
    detail.style.display = 'block';
  } catch (e) {
    console.error('Error loading orders:', e);
    document.getElementById('ticketingDetailContent').innerHTML = '<p style="color:#b91c1c">Error cargando órdenes: ' + e.message + '</p>';
  }
}

function switchToTicketTypesAdmin() {
  if (_user.accountType !== 'admin') return;
  const detail = document.getElementById('ticketingDetailView');
  const detailTitle = document.getElementById('ticketingDetailTitle');
  const detailContent = document.getElementById('ticketingDetailContent');
  
  detailTitle.textContent = 'Gestor de tipos de entrada (Admin)';
  detailContent.innerHTML = '<div style="margin-bottom:14px"><div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;margin-bottom:10px"><input id="tkTypeName" placeholder="Nombre (ej: General, VIP)" style="padding:8px;border:1px solid #d4dbe8;border-radius:9px"><input id="tkTypePrice" type="number" placeholder="Precio" style="padding:8px;border:1px solid #d4dbe8;border-radius:9px"><input id="tkTypeQty" type="number" placeholder="Cantidad" style="padding:8px;border:1px solid #d4dbe8;border-radius:9px"><input id="tkTypeCategory" placeholder="Categoría" style="padding:8px;border:1px solid #d4dbe8;border-radius:9px"><button onclick="createNewTicketType()" style="padding:8px 12px;background:#1d4ed8;color:#fff;border:0;border-radius:9px;cursor:pointer;font-weight:700;font-size:12px">Crear</button></div><div id="tkTypesList" style="margin-top:12px"></div></div>';
  loadTicketTypes();
  detail.style.display = 'block';
}

async function loadTicketTypes() {
  try {
    const r = await fetch(gatewayUrl('/tickets/types'), {
      headers: { 'Authorization': 'Bearer ' + _token }
    });
    const types = await r.json();
    const list = document.getElementById('tkTypesList');
    if (!types || types.length === 0) {
      list.innerHTML = '<p style="color:#5b6475;font-size:13px">Sin tipos de entrada registrados.</p>';
    } else {
      let html = '<div style="display:grid;gap:8px">';
      types.forEach(function(t) {
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:8px;background:#f9fafb;padding:10px;border-radius:9px;border:1px solid #e5e9f2;align-items:center"><div style="font-weight:700;font-size:13px">' + (t.name || '-') + '</div><div style="font-size:12px;color:#5b6475">$' + (t.price || 0).toFixed(2) + '</div><div style="font-size:12px;color:#5b6475">Disponibles: ' + (t.quantity - (t.quantitySold || 0)) + '/' + (t.quantity || 0) + '</div><div style="font-size:12px;color:#5b6475">' + (t.category || 'General') + '</div><button onclick="deleteTicketType(\\'' + t.id + '\\')" style="padding:4px 8px;background:#fee2e2;color:#b91c1c;border:0;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700">Eliminar</button></div>';
      });
      html += '</div>';
      list.innerHTML = html;
    }
  } catch (e) {
    console.error('Error loading types:', e);
  }
}

async function createNewTicketType() {
  const name = document.getElementById('tkTypeName')?.value || '';
  const price = parseFloat(document.getElementById('tkTypePrice')?.value || '0');
  const qty = parseInt(document.getElementById('tkTypeQty')?.value || '0');
  const cat = document.getElementById('tkTypeCategory')?.value || 'General';
  if (!name || price <= 0 || qty <= 0) {
    alert('Por favor completa todos los campos correctamente');
    return;
  }
  try {
    const r = await fetch(gatewayUrl('/tickets/types'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token },
      body: JSON.stringify({ name, price, quantity: qty, category: cat })
    });
    if (!r.ok) throw new Error((await r.json()).message || 'Error creando tipo');
    document.getElementById('tkTypeName').value = '';
    document.getElementById('tkTypePrice').value = '';
    document.getElementById('tkTypeQty').value = '';
    document.getElementById('tkTypeCategory').value = 'General';
    await loadTicketTypes();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function deleteTicketType(id) {
  if (!confirm('¿Eliminar este tipo de entrada?')) return;
  try {
    const r = await fetch(gatewayUrl('/tickets/types/' + encodeURIComponent(id)), {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + _token }
    });
    if (!r.ok) throw new Error('Error al eliminar');
    await loadTicketTypes();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
</script>
</body>
</html>`;
	}

  @Get('confirm')
  async confirmEmail(@Query('token') token: string, @Res() res: any) {
    const baseUrl = String(process.env.APP_BASE_URL ?? '').trim().replace(/\/+$/, '');
    const frontendRoot = baseUrl || 'http://localhost:3009';
    const result = await this.userService.confirmEmail(token);
    if (result.ok && result.reason === 'verified') {
			return res.redirect(`${frontendRoot}/?confirmed=1`);
    }
    if (result.ok && result.reason === 'already_verified') {
			return res.redirect(`${frontendRoot}/?confirmed=1`);
    }
    if (result.reason === 'expired') {
			return res.redirect(`${frontendRoot}/?confirmed=expired`);
    }
		return res.redirect(`${frontendRoot}/?confirmed=invalid`);
  }

	@Post('data')
	@UsePipes(new ValidationPipe({ transform: true }))
	async create(@Body() user: CreateUserDto) {
    // Registro publico: nunca aceptar accountType del cliente (privilege escalation).
    const safeUser: CreateUserDto = { ...user, accountType: 'standard' };
    const result = await this.userService.create(safeUser);
    return {
      message: 'Cuenta creada. Debes confirmar tu correo para activarla.',
      requiresEmailConfirmation: result.requiresEmailConfirmation,
      emailSent: result.emailSent,
      mailReason: result.mailReason,
      confirmationPreviewUrl: result.confirmationPreviewUrl,
      user: this.toPublicUser(result.user),
    };
	}

  @Get('summary')
  async summary() {
    return { total: await this.userService.countAll() };
  }

	@Get('data')
  async findAll(@Query('limit') limit?: string) {
    const users = await this.userService.findAll(Number(limit ?? 50));
    return users.map((user) => this.toPublicUser(user));
	}

	@Get('data/:id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    const user = await this.userService.findOne(id);
    return user ? this.toPublicUser(user) : null;
	}

	@Put('data/:id')
	@UseGuards(RoleGuard)
	@Roles('admin')
  async update(@Param('id', new ParseUUIDPipe()) id: string, @Body() user: Partial<CreateUserDto>) {
		return await this.userService.update(id, user);
	}

	@Delete('data/:id')
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
		return await this.userService.remove(id);
	}

	@Post('auth/login')
	async login(@Body() body: { email: string; password: string }) {
    const user = await this.userService.findByEmail((body.email ?? '').trim().toLowerCase());
    if (!user) {
			throw new UnauthorizedException('Credenciales invalidas');
		}

    if (typeof user.password === 'string' && user.password.startsWith('reset-required-')) {
      throw new UnauthorizedException('Debes restablecer tu contrasena antes de iniciar sesion');
    }

    if (user.password !== body.password) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException('Debes confirmar tu correo antes de iniciar sesion');
    }

		const token = this.jwtService.sign({
			sub: user.id,
      name: user.name,
			email: user.email,
			accountType: user.accountType,
		});

		const refreshToken = this.jwtService.sign(
			{
				sub: user.id,
				type: 'refresh',
			},
			{ expiresIn: '7d' },
		);
		refreshTokenByUserId.set(user.id, refreshToken);

		return {
			accessToken: token,
			refreshToken,
      user: this.toPublicProfileUser(user),
		};
	}

	@Post('auth/refresh')
	async refresh(@Body() body: { refreshToken: string }) {
		try {
			const payload = this.jwtService.verify(body.refreshToken, {
				secret: process.env.JWT_SECRET ?? 'dev_only_change_me',
			});

			if (payload.type !== 'refresh') {
				throw new UnauthorizedException('Refresh token invalido');
			}

			const stored = refreshTokenByUserId.get(payload.sub);
			if (!stored || stored !== body.refreshToken) {
				throw new UnauthorizedException('Refresh token expirado');
			}

			const user = await this.userService.findOne(payload.sub);
			if (!user) {
				throw new UnauthorizedException('Usuario no encontrado');
			}

			const accessToken = this.jwtService.sign({
				sub: user.id,
        name: user.name,
				email: user.email,
				accountType: user.accountType,
			});

			return { accessToken };
		} catch {
			throw new UnauthorizedException('No autorizado');
		}
	}

	@Post('auth/check-permission')
	async checkPermission(@Body() body: { email: string; permission: string }) {
		const user = await this.userService.findByEmail(body.email);
		if (!user) {
			return { allowed: false, reason: 'Usuario no encontrado' };
		}

		return {
			allowed: this.userService.hasPermission(user.accountType, body.permission),
			accountType: user.accountType,
			permission: body.permission,
		};
	}

  @Post('auth/forgot-password')
  @UsePipes(new ValidationPipe({ transform: true }))
  async forgotPassword(@Body() body: ForgotPasswordDto) {
    const result = await this.userService.requestPasswordReset(body.email);
    return {
      message: 'Si la cuenta existe, se enviaron instrucciones para restablecer la contrasena',
      emailSent: (result as { emailSent?: boolean }).emailSent,
      mailReason: (result as { mailReason?: string }).mailReason,
      resetPreviewUrl: (result as { resetPreviewUrl?: string }).resetPreviewUrl,
    };
  }

  @Post('auth/reset-password')
  @UsePipes(new ValidationPipe({ transform: true }))
  async resetPassword(@Body() body: ResetPasswordDto) {
    const result = await this.userService.resetPassword(body.token, body.password);
    if (result.ok) {
      return { message: 'Contrasena restablecida correctamente' };
    }

    if (result.reason === 'expired') {
      throw new UnauthorizedException('El enlace de recuperacion expiro');
    }

    throw new UnauthorizedException('El enlace de recuperacion no es valido');
  }

  @Post('auth/resend-confirmation')
  async resendConfirmation(@Body() body: { email: string }) {
    if (!body?.email) {
      return { message: 'Debes enviar un correo valido' };
    }

    const result = await this.userService.resendConfirmationEmail(body.email);
    if (result.status === 'already_verified') {
      return { message: 'Tu correo ya estaba confirmado' };
    }

    return {
      message: 'Si la cuenta existe y no esta confirmada, se envio un correo de verificacion',
      emailSent: (result as { emailSent?: boolean }).emailSent,
      mailReason: (result as { mailReason?: string }).mailReason,
      confirmationPreviewUrl: (result as { confirmationPreviewUrl?: string }).confirmationPreviewUrl,
    };
  }

  @Put('profile')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateProfile(@Body() body: UpdateProfileDto, @Req() req: Record<string, unknown>) {
    const userId = this.extractUserIdFromRequest(req);
    if (!userId) throw new UnauthorizedException('Sesion no valida');
    const result = await this.userService.updateProfile(userId, body);
    if (!result.ok) {
      const msgMap: Record<string, string> = {
        not_found: 'Usuario no encontrado',
        password_required: 'Debes introducir tu contrasena actual para cambiar el nombre',
        wrong_current_password: 'La contrasena actual no es correcta',
      };
      throw new UnauthorizedException(msgMap[result.reason ?? ''] ?? 'No se pudo actualizar el perfil');
    }
    return { message: 'Perfil actualizado', user: this.toPublicProfileUser(result.user!) };
  }

  @Post('auth/request-password-change')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async requestPasswordChange(@Body() body: RequestPasswordChangeDto, @Req() req: Record<string, unknown>) {
    const userId = this.extractUserIdFromRequest(req);
    if (!userId) throw new UnauthorizedException('Sesion no valida');
    const result = await this.userService.requestPasswordChange(userId, body);
    if (!result.ok) {
      if (result.reason === 'wrong_current_password') throw new UnauthorizedException('La contraseña actual no es correcta');
      throw new UnauthorizedException('No se pudo procesar el cambio de contraseña');
    }
    return {
      message: 'Se envio un correo de confirmacion. Revisa tu bandeja de entrada.',
      emailSent: result.emailSent,
      previewUrl: result.previewUrl,
    };
  }

  @Post('auth/confirm-password-change')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async confirmPasswordChange(@Body() body: ConfirmPasswordChangeDto) {
    const result = await this.userService.confirmPasswordChange(body.token);
    if (!result.ok) {
      if (result.reason === 'expired') throw new UnauthorizedException('El enlace de confirmacion expiro');
      throw new UnauthorizedException('El enlace de confirmacion no es valido');
    }
    return { message: 'Contraseña cambiada correctamente. Por favor vuelve a iniciar sesion.' };
  }

  private toPublicUser(user: {
    id: string;
    name: string;
    email: string;
    accountType: string;
    isEmailVerified?: boolean;
    emailVerifiedAt?: Date | null;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      accountType: user.accountType,
      isEmailVerified: Boolean(user.isEmailVerified),
      emailVerifiedAt: user.emailVerifiedAt ?? null,
    };
  }

  private toPublicProfileUser(user: {
    id: string; name: string; email: string; accountType: string;
    isEmailVerified?: boolean; emailVerifiedAt?: Date | null; avatarUrl?: string | null;
  }) {
    return { ...this.toPublicUser(user), avatarUrl: user.avatarUrl ?? null };
  }

  private extractUserIdFromRequest(req: Record<string, unknown>): string | null {
    try {
      const authHeader = (req as { headers?: { authorization?: string } }).headers?.authorization ?? '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token) return null;
      const payload = this.jwtService.verify(token) as { sub?: string; id?: string };
      return payload?.sub ?? payload?.id ?? null;
    } catch {
      return null;
    }
  }
}

