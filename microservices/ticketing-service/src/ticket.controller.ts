import { readFileSync } from 'fs';
import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { MercadoPagoService } from './mercadopago.service';
import { RoleGuard } from './guards/role.guard';
import { Roles } from './decorators/roles.decorator';

const HEIC2ANY_BROWSER_BUNDLE = readFileSync(require.resolve('heic2any/dist/heic2any.min.js'), 'utf8');

@Controller('tickets')
export class TicketController {
  constructor(
    private readonly ticketService: TicketService,
    private readonly mpService: MercadoPagoService,
  ) {}

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

  @Get('assets/heic2any.min.js')
  @Header('Content-Type', 'application/javascript; charset=utf-8')
  renderHeic2AnyBrowserBundle() {
    return HEIC2ANY_BROWSER_BUNDLE;
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
    input,select,button,.typeImagePicker{
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
    .typeEditor{display:grid;gap:16px;margin-top:12px;padding:18px;border:1px solid #e7edf7;border-radius:18px;background:linear-gradient(180deg,#fff 0%,#f8fbff 100%)}
    .typeEditorHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .typeEditorTitle{display:grid;gap:4px}
    .typeEditorTitle h3{margin:0;font-size:17px;letter-spacing:-.01em}
    .typeEditorActions{display:flex;gap:8px;flex-wrap:wrap}
    .typeEditorLayout{display:grid;gap:14px}
    .typeEditorBlock{display:grid;gap:12px;padding:14px;border:1px solid #e7edf7;border-radius:16px;background:#fff}
    .typeEditorBlockHead{display:grid;gap:5px}
    .typeEditorEyebrow{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b}
    .typeEditorBlockTitle{margin:0;font-size:16px;letter-spacing:-.02em;color:#0f172a}
    .typeEditorBlockCopy{margin:0;font-size:13px;line-height:1.5;color:#64748b}
    .typeEditorGrid{display:grid;gap:10px}
    .typeEditorGridMain{grid-template-columns:repeat(4,minmax(0,1fr))}
    .typeEditorGridEvent{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr) minmax(0,.9fr)}
    .typeImageRow{display:grid;grid-template-columns:148px minmax(0,1fr);gap:16px;align-items:flex-start;padding:14px;border:1px solid #e7edf7;border-radius:16px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%)}
    .typeImagePreview{width:132px;height:96px;border-radius:14px;border:1px solid #dbe5f3;background:linear-gradient(160deg,#dbeafe 0%,#eff6ff 55%,#f8fafc 100%);overflow:hidden;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;font-weight:800;font-size:12px;line-height:1.4;padding:8px;cursor:pointer}
    .typeImagePreview img{width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center;display:block;margin:0 auto}
    .typeImagePreview.empty img{display:none}
    .typeImagePreview.is-wide{padding:6px}
    .typeImagePreview.is-wide img{width:100%;height:auto;max-height:100%}
    .typeImagePreview.is-tall{padding:6px 20px}
    .typeImagePreview.is-tall img{width:auto;height:100%;max-width:100%}
    .typeImagePreview.is-square{padding:8px 12px}
    .typeImageInput{position:absolute;opacity:0;pointer-events:none;width:1px;height:1px}
    .typeImageControls{display:grid;gap:10px;min-width:0;align-content:start}
    .typeImageToolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .typeImagePicker{display:inline-flex;align-items:center;justify-content:center;min-width:132px;text-decoration:none;background:#fff;color:#1e3a8a;border:1px solid #bfdbfe;font-weight:800;cursor:pointer}
    .typeImageFileName{min-width:0;font-size:13px;color:#475569;font-weight:600;word-break:break-word}
    .typeImageButtons{display:flex;gap:8px;flex-wrap:wrap}
    .typeImageButtons button[disabled]{opacity:.55;cursor:not-allowed}
    .typeOverview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}
    .typeOverviewItem{padding:12px 14px;border:1px solid #dbe5f3;border-radius:14px;background:linear-gradient(180deg,#ffffff 0%,#f8fbff 100%);display:grid;gap:4px}
    .typeOverviewItem strong{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.03em}
    .typeOverviewItem span{font-size:22px;font-weight:800;color:#0f172a;line-height:1}
    .typeCards{display:grid;gap:14px;margin-top:16px}
    .typeCard{display:grid;grid-template-columns:minmax(280px,320px) minmax(0,1fr);gap:18px;align-items:stretch;padding:16px;border:1px solid #dde6f2;border-radius:18px;background:#fff;box-shadow:0 10px 22px rgba(15,23,42,.06)}
    .typeCard.archived{opacity:.84}
    .typeCardMedia{position:relative;min-height:252px;height:100%;border-radius:18px;overflow:hidden;border:1px solid #d6e4ff;background:linear-gradient(160deg,#dbeafe 0%,#f8fafc 100%);display:flex;align-items:center;justify-content:center;padding:14px}
    .typeCardMedia img{width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;object-position:center;display:block;margin:0 auto}
    .typeCardMedia.is-wide{min-height:220px;padding:10px 8px}
    .typeCardMedia.is-wide img{width:100%;height:auto;max-height:100%}
    .typeCardMedia.is-tall{min-height:300px;padding:10px 30px}
    .typeCardMedia.is-tall img{width:auto;height:100%;max-width:100%}
    .typeCardMedia.is-square{padding:14px 18px}
    .typeCardFallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;color:#64748b;font-weight:800;line-height:1.5}
    .typeCardBody{display:grid;gap:14px;min-width:0;align-content:start}
    .typeCardHead{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:flex-start;gap:12px}
    .typeCardTitleWrap{display:grid;gap:6px;min-width:0}
    .typeCardTitle{margin:0;font-size:24px;line-height:1.05;letter-spacing:-.03em;word-break:break-word}
    .typeCardSubtitle{font-size:13px;color:#64748b;line-height:1.5}
    .typeMetaRow{display:flex;gap:8px;flex-wrap:wrap}
    .typeChip{display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:5px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;max-width:100%}
    .typeChip.event{background:#e0ecff;color:#1d4ed8}
    .typeChip.category{background:#fef3c7;color:#92400e}
    .typeChip.stock-ok{background:#dcfce7;color:#166534}
    .typeChip.stock-low{background:#fee2e2;color:#b45309}
    .typeChip.stock-empty{background:#fee2e2;color:#b91c1c}
    .typeChip.archived{background:#e5e7eb;color:#374151}
    .typeCardPriceWrap{display:grid;gap:8px;justify-items:end}
    .typeCardPrice{font-size:26px;font-weight:800;color:#1e3a8a;line-height:1}
    .typeStatus{display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.03em;text-transform:uppercase}
    .typeStatus.active{background:#dcfce7;color:#166534}
    .typeStatus.archived{background:#e5e7eb;color:#374151}
    .typeAvailability{display:grid;gap:8px;padding:12px 14px;border:1px solid #e5edf8;border-radius:14px;background:linear-gradient(180deg,#fbfdff 0%,#f8fafc 100%)}
    .typeAvailabilityHead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .typeAvailabilityLabel{font-size:13px;color:#475569;font-weight:700}
    .typeAvailabilityValue{font-size:12px;color:#64748b;font-weight:700}
    .typeAvailabilityBar{height:10px;border-radius:999px;background:#e2e8f0;overflow:hidden}
    .typeAvailabilityFill{height:100%;border-radius:999px;background:linear-gradient(90deg,#22c55e 0%,#16a34a 100%)}
    .typeAvailabilityFill.low{background:linear-gradient(90deg,#f59e0b 0%,#d97706 100%)}
    .typeAvailabilityFill.empty{background:linear-gradient(90deg,#ef4444 0%,#dc2626 100%)}
    .typeAvailabilityFill.archived{background:linear-gradient(90deg,#94a3b8 0%,#64748b 100%)}
    .typeCardDetails{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
    .typeStats{display:grid;grid-template-columns:1fr;gap:8px}
    .typeStat{padding:11px 12px;border:1px solid #e8eef8;border-radius:12px;background:#f8fafc;display:grid;gap:4px}
    .typeStat strong{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.03em}
    .typeStat span{font-size:15px;color:#0f172a;line-height:1.35;word-break:break-word}
    .typeInfoGrid{display:grid;grid-template-columns:1fr;gap:8px}
    .typeCardActions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
    .emptyTypeState{padding:18px;border:1px dashed #bfd0ea;border-radius:16px;background:#f8fbff;color:#64748b;font-size:14px}
    .small{font-size:12px;color:var(--muted)}
    .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px}
    .kpi .label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.03em}
    .kpi .value{margin-top:6px;font-size:24px;font-weight:800}

    /* ── Catalogo cliente: filtros ── */
    .client-filter-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding:10px 12px;background:#f8faff;border:1px solid #dde6f2;border-radius:12px}
    .client-filter-bar input,.client-filter-bar select{height:36px;border-radius:8px;border:1px solid #c8d4e6;padding:0 10px;font:inherit;font-size:13px;background:#fff;flex:1;min-width:120px}
    .client-filter-bar select{min-width:160px;max-width:200px}
    .client-filter-bar input:focus,.client-filter-bar select:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
    /* ── Catalogo cliente: grid compact ── */
    .catalog-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:10px}
    .cc-card{position:relative;background:#fff;border:1px solid #dde6f2;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;transition:box-shadow .15s,transform .15s;cursor:default}
    .cc-card:hover{box-shadow:0 8px 28px rgba(15,23,42,.14);transform:translateY(-2px)}
    .cc-hover-overlay{position:absolute;inset:0;background:rgba(15,23,42,.93);border-radius:12px;padding:12px 13px;opacity:0;pointer-events:none;transition:opacity .18s ease;display:flex;flex-direction:column;gap:6px;z-index:20;overflow:hidden}
    .cc-card:hover .cc-hover-overlay{opacity:1;pointer-events:all}
    .cc-ho-name{font-size:13px;font-weight:800;color:#fff;line-height:1.2;padding-bottom:7px;border-bottom:1px solid rgba(255,255,255,.13);margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cc-ho-price{font-size:17px;font-weight:900;color:#f97316;letter-spacing:-.01em}
    .cc-ho-rows{display:flex;flex-direction:column;gap:4px;flex:1}
    .cc-ho-row{display:flex;gap:5px;font-size:11px;line-height:1.4;align-items:baseline}
    .cc-ho-lbl{color:#94a3b8;min-width:70px;flex-shrink:0}
    .cc-ho-val{color:#f1f5f9;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
    .btn-cart-ov{margin-top:auto;width:100%;background:linear-gradient(135deg,#e85d04,#dc2f02);color:#fff;border:0;border-radius:8px;padding:7px 0;font-size:12px;font-weight:800;cursor:pointer;transition:opacity .15s;flex-shrink:0}
    .btn-cart-ov:hover{opacity:.87}
    .btn-cart-ov.in-cart{background:linear-gradient(135deg,#16a34a,#166534)}
    .btn-cart-ov:disabled{background:#475569;cursor:not-allowed;opacity:.55}
    .cc-img{height:120px;background:linear-gradient(160deg,#dbeafe 0%,#f8fafc 100%);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0}
    .cc-img img{width:100%;height:100%;object-fit:cover;display:block}
    .cc-img-fallback{font-size:11px;font-weight:700;color:#94a3b8;text-align:center;padding:8px;line-height:1.4}
    .cc-body{padding:9px 10px;display:flex;flex-direction:column;gap:4px;flex:1}
    .cc-name{font-size:13px;font-weight:800;color:#0f172a;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cc-event{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cc-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:2px}
    .cc-chip{display:inline-flex;align-items:center;height:18px;padding:0 7px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.02em}
    .cc-chip.cat{background:#fef3c7;color:#92400e}
    .cc-chip.avail-ok{background:#dcfce7;color:#166534}
    .cc-chip.avail-low{background:#fff7ed;color:#c2410c}
    .cc-chip.avail-empty{background:#fee2e2;color:#b91c1c}
    .cc-footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding:8px 10px;border-top:1px solid #edf2f8}
    .cc-price{font-size:14px;font-weight:800;color:#1e3a8a}
    .cc-avail{font-size:10px;color:#64748b}
    .btn-cart{height:30px;padding:0 10px;border-radius:7px;background:linear-gradient(135deg,#e85d04,#dc2f02);color:#fff;border:0;font-weight:800;font-size:11px;cursor:pointer;transition:opacity .15s;white-space:nowrap}
    .btn-cart:hover{opacity:.88}
    .btn-cart:disabled{opacity:.4;cursor:not-allowed}
    .btn-cart.in-cart{background:linear-gradient(135deg,#16a34a,#166534)}
    /* ── Carrito en panel-orders ── */
    .cart-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .cart-head h3{margin:0;font-size:15px;font-weight:800}
    .cart-item{display:flex;align-items:center;gap:9px;padding:9px 10px;border:1px solid #dde6f2;border-radius:10px;background:#fff;margin-bottom:7px}
    .cart-item input[type=checkbox]{width:15px;height:15px;accent-color:#e85d04;flex-shrink:0;cursor:pointer}
    .cart-item-img{width:42px;height:42px;border-radius:8px;overflow:hidden;background:#eef2f9;flex-shrink:0;display:flex;align-items:center;justify-content:center}
    .cart-item-img img{width:100%;height:100%;object-fit:cover}
    .cart-item-info{flex:1;min-width:0}
    .cart-item-name{font-size:13px;font-weight:800;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .cart-item-sub{font-size:11px;color:#64748b}
    .cart-qty{width:48px;height:28px;border:1px solid #c8d4e6;border-radius:7px;padding:0 5px;font:inherit;font-size:13px;text-align:center}
    .cart-item-price{font-size:13px;font-weight:800;color:#1e3a8a;min-width:64px;text-align:right;flex-shrink:0}
    .btn-remove-cart{width:26px;height:26px;border:0;background:none;cursor:pointer;color:#94a3b8;font-size:16px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:6px;flex-shrink:0}
    .btn-remove-cart:hover{background:#fee2e2;color:#dc2626}
    .cart-empty{padding:20px;text-align:center;color:#94a3b8;font-size:13px;border:1px dashed #c8d4e6;border-radius:10px}
    .cart-footer-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 0 4px;border-top:1px solid #e5edf8;margin-top:4px;gap:10px;flex-wrap:wrap}
    .cart-total-label{font-size:15px;font-weight:800;color:#0f172a}
    .orders-divider{border:none;border-top:1.5px solid #e5edf8;margin:16px 0}
    .orders-history-head{font-size:14px;font-weight:800;color:#374151;margin:0 0 8px}
    /* ── */
    @media(max-width:1180px){
      .typeEditorGridMain{grid-template-columns:repeat(2,minmax(0,1fr))}
      .typeEditorGridEvent{grid-template-columns:repeat(2,minmax(0,1fr))}
      .typeCard{grid-template-columns:minmax(250px,280px) minmax(0,1fr)}
    }
    @media(max-width:980px){
      .grid,.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
      .grid-2{grid-template-columns:1fr}
      .typeOverview{grid-template-columns:repeat(2,minmax(0,1fr))}
      .typeCard{grid-template-columns:1fr}
      .typeCardMedia{min-height:220px;padding:10px}
      .typeCardMedia.is-tall{min-height:260px;padding:10px 22px}
      .typeCardHead,.typeCardDetails{grid-template-columns:1fr}
      .typeEditorGridMain,.typeEditorGridEvent{grid-template-columns:1fr}
      .typeImageRow{grid-template-columns:1fr}
      .typeImagePreview{width:100%;max-width:172px}
    }
    @media(max-width:640px){
      .grid,.kpis{grid-template-columns:1fr}
      .typeOverview{grid-template-columns:1fr}
      .top{flex-direction:column;align-items:flex-start}
      .badges{justify-content:flex-start}
      .typeStats,.typeInfoGrid{grid-template-columns:1fr}
      .typeCardPriceWrap,.typeCardActions{justify-items:start;justify-content:flex-start}
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
      <button id="tabBuy" onclick="showTab('buy')" style="display:none">Compra</button>
      <button id="tabOrders" onclick="showTab('orders')">Ordenes</button>
      <button id="tabTicket" onclick="showTab('ticket')" style="display:none">Ticket</button>
      <button id="tabSummary" onclick="showTab('summary')">Resumen</button>
    </nav>

    <section id="panel-catalog" class="panel active">
      <div class="card">
        <h2>Tipos de Ticket</h2>
        <div id="catalogMsg" class="msg"></div>
        <div id="createTypeForm" class="typeEditor">
          <input id="editingTypeId" type="hidden">
          <div class="typeEditorHead">
            <div class="typeEditorTitle">
              <h3 id="typeFormTitle">Crear tipo de ticket</h3>
              <div class="small">Solo organizadores pueden crear, editar y cambiar la foto del equipo.</div>
            </div>
            <div class="typeEditorActions">
              <button id="saveTypeBtn" class="primary" type="button" onclick="createType()">Crear tipo</button>
              <button id="cancelTypeBtn" class="ghost" type="button" onclick="resetTypeForm()" style="display:none">Cancelar edicion</button>
              <button class="ghost" type="button" onclick="loadTypes()">Recargar</button>
            </div>
          </div>
          <div class="typeEditorLayout">
            <section class="typeEditorBlock">
              <div class="typeEditorBlockHead">
                <span class="typeEditorEyebrow">Datos principales</span>
                <h4 class="typeEditorBlockTitle">Configura el ticket</h4>
                <p class="typeEditorBlockCopy">Define nombre, precio, cupo total y el limite de compra por persona.</p>
              </div>
              <div class="typeEditorGrid typeEditorGridMain">
                <input id="typeName" placeholder="Nombre (General, VIP, Taller)">
                <input id="typePrice" type="number" min="1" step="0.01" placeholder="Precio">
                <input id="typeQty" type="number" min="1" step="1" placeholder="Cantidad total">
                <input id="typeMaxPerson" type="number" min="0" step="1" placeholder="Max por persona (0 = sin limite)">
              </div>
            </section>

            <section class="typeEditorBlock">
              <div class="typeEditorBlockHead">
                <span class="typeEditorEyebrow">Evento y clasificacion</span>
                <h4 class="typeEditorBlockTitle">Relaciona el ticket con el evento</h4>
                <p class="typeEditorBlockCopy">Selecciona el evento, revisa la ubicacion sugerida y agrega una categoria si la necesitas.</p>
              </div>
              <div class="typeEditorGrid typeEditorGridEvent">
                <select id="typeEventId" style="height:40px;border-radius:10px;border:1px solid #c8d4e6;padding:0 11px;font:inherit;font-size:14px">
                  <option value="">-- Sin evento --</option>
                </select>
                <input id="typeLocation" placeholder="Ubicacion del evento (auto)" readonly style="background:#f8fafc;color:#64748b">
                <input id="typeCategory" placeholder="Categoria (opcional)">
              </div>
            </section>

            <section class="typeEditorBlock">
              <div class="typeEditorBlockHead">
                <span class="typeEditorEyebrow">Imagen del ticket</span>
                <h4 class="typeEditorBlockTitle">Previsualiza la foto del equipo</h4>
                <p class="typeEditorBlockCopy">Sube una imagen clara para que el ticket se vea mejor en catalogo y en la credencial del asistente.</p>
              </div>
              <div class="typeImageRow">
                <label id="typeImagePreview" class="typeImagePreview empty" for="typeImageFile">
                  <img id="typeImagePreviewImg" alt="Imagen del equipo">
                  <span id="typeImagePreviewText">Sin foto guardada</span>
                </label>
                <div class="typeImageControls">
                  <input id="typeImageFile" class="typeImageInput" type="file" accept=".jpg,.jpeg,.png,.webp,.svg,.heic,.heif,image/jpeg,image/png,image/webp,image/svg+xml,image/heic,image/heif">
                  <div class="typeImageToolbar">
                    <label class="typeImagePicker" for="typeImageFile">Elegir foto</label>
                    <div id="typeImageFileName" class="typeImageFileName">Ningun archivo seleccionado.</div>
                  </div>
                  <div id="typeImageState" class="small">JPG, PNG, WebP, SVG o HEIC/HEIF. Convertimos HEIC localmente y ajustamos resolucion, peso y encuadre automaticamente cuando eliges la foto.</div>
                  <div class="typeImageButtons">
                    <button id="removeTypeImageBtn" class="ghost" type="button" onclick="removeTypeImage()" disabled>Quitar foto</button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
        <div id="typesOverview" class="typeOverview"></div>
        <div id="typesCards" class="typeCards"></div>
        <!-- Vista cliente: filtros y grid compact (oculto para admin) -->
        <div id="clientFilterBar" class="client-filter-bar" style="display:none">
          <input id="cfSearch" type="text" placeholder="Buscar por nombre..." oninput="filterClientCatalog()">
          <input id="cfPriceMin" type="number" min="0" placeholder="Precio min" oninput="filterClientCatalog()" style="max-width:130px">
          <input id="cfPriceMax" type="number" min="0" placeholder="Precio max" oninput="filterClientCatalog()" style="max-width:130px">
          <select id="cfSort" onchange="filterClientCatalog()">
            <option value="">Ordenar por...</option>
            <option value="price-asc">Precio: menor a mayor</option>
            <option value="price-desc">Precio: mayor a menor</option>
            <option value="name-asc">Nombre A-Z</option>
            <option value="avail-desc">Mas disponibles</option>
          </select>
        </div>
        <div id="clientCatalogGrid" class="catalog-grid" style="display:none"></div>
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
        <!-- Carrito (solo participante) -->
        <div id="cartSection" style="display:none">
          <div class="cart-head">
            <h3 id="cartTitle">Carrito</h3>
            <button class="ghost" style="height:30px;padding:0 10px;font-size:12px" onclick="clearCart()">Vaciar carrito</button>
          </div>
          <div id="cartItems"></div>
          <div id="cartEmpty" class="cart-empty">Tu carrito esta vacio. Agrega tickets desde el Catalogo.</div>
          <div id="cartFooter" class="cart-footer-bar" style="display:none">
            <span class="cart-total-label">Total seleccionado: <span id="cartTotal">$0.00</span></span>
            <button id="purchaseBtn" class="primary" style="height:36px;padding:0 16px;font-size:13px" onclick="purchaseSelected()">Comprar seleccionados</button>
          </div>
          <div id="cartMsg" class="msg"></div>
          <hr class="orders-divider">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px">
            <p class="orders-history-head" style="margin:0">Historial de ordenes</p>
            <button id="verifyPaymentsBtn" class="ghost" style="height:30px;padding:0 12px;font-size:12px;background:#eff6ff;border-color:#3b82f6;color:#1d4ed8" onclick="verifyPendingPayments()">Verificar mis pagos</button>
          </div>
        </div>
        <h2 id="ordersHeading">Ordenes</h2>
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

    <section id="panel-ticket" class="panel">
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px">
          <div>
            <h2 style="margin:0">Tickets Comprados</h2>
            <div class="small" style="margin-top:4px">Aqui aparecen los tickets que ya tienen pago aprobado.</div>
          </div>
          <button class="ghost" type="button" onclick="loadPurchased()">Actualizar</button>
        </div>
        <div id="ticketMsg" class="msg"></div>
        <div id="ticketPurchasedGrid" class="catalog-grid" style="display:grid"></div>
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

  <script src="/tickets/assets/heic2any.min.js"></script>
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
    let cart = {}; // { [ticketTypeId]: { type: object, qty: number } }
    let eventsCache = [];
    let currentTypeImageData = '';
    const MAX_TICKET_IMAGE_SIZE = 1800000;
    const DEFAULT_TYPE_IMAGE_HELP = 'JPG, PNG, WebP, SVG o HEIC/HEIF. Convertimos HEIC localmente y ajustamos resolucion, peso y encuadre de fotos verticales o panoramicas automaticamente al subirla; luego se guarda cuando creas o actualizas el ticket.';
    const EMPTY_SAVED_IMAGE_HELP = 'Este ticket aun no tiene una foto guardada. Elige una y guarda los cambios.';

    function canAccessTab(tab) {
      if (userRole === 'admin') {
        return ['catalog', 'orders', 'summary'].includes(tab);
      }
      if (userRole === 'standard') {
        return ['catalog', 'buy', 'orders', 'ticket'].includes(tab);
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
        pending_mp: '⏳ Verificando pago',
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

    function clearTicketImageFrameClass(frame) {
      if (!frame) {
        return;
      }
      frame.classList.remove('is-wide', 'is-tall', 'is-square');
    }

    function applyTicketImageFrameClass(frame, image) {
      if (!frame || !image) {
        return;
      }

      const width = Number(image.naturalWidth || image.width || 0);
      const height = Number(image.naturalHeight || image.height || 0);
      clearTicketImageFrameClass(frame);
      if (!width || !height) {
        return;
      }

      const ratio = width / height;
      if (ratio >= 1.7) {
        frame.classList.add('is-wide');
        return;
      }
      if (ratio <= 0.82) {
        frame.classList.add('is-tall');
        return;
      }
      frame.classList.add('is-square');
    }

    function renderTypeImagePreview(imageUrl) {
      const preview = document.getElementById('typeImagePreview');
      const image = document.getElementById('typeImagePreviewImg');
      const text = document.getElementById('typeImagePreviewText');
      const removeButton = document.getElementById('removeTypeImageBtn');
      if (!preview || !image || !text) {
        return;
      }

      if (imageUrl) {
        preview.classList.remove('empty');
        clearTicketImageFrameClass(preview);
        image.onload = function() {
          applyTicketImageFrameClass(preview, image);
        };
        image.onerror = function() {
          clearTicketImageFrameClass(preview);
        };
        image.src = imageUrl;
        if (image.complete) {
          applyTicketImageFrameClass(preview, image);
        }
        image.style.display = 'block';
        text.style.display = 'none';
        if (removeButton) {
          removeButton.disabled = false;
        }
        return;
      }

      preview.classList.add('empty');
      clearTicketImageFrameClass(preview);
      image.removeAttribute('src');
      image.style.display = 'none';
      text.style.display = 'block';
      if (removeButton) {
        removeButton.disabled = true;
      }
    }

    function setTypeImageControls(fileName, helperText) {
      const fileNameNode = document.getElementById('typeImageFileName');
      const stateNode = document.getElementById('typeImageState');
      const removeButton = document.getElementById('removeTypeImageBtn');
      if (fileNameNode) {
        fileNameNode.textContent = fileName || 'Ningun archivo seleccionado.';
      }
      if (stateNode) {
        stateNode.textContent = helperText || DEFAULT_TYPE_IMAGE_HELP;
      }
      if (removeButton) {
        removeButton.disabled = !currentTypeImageData;
      }
    }

    function openTypeImagePicker() {
      if (userRole !== 'admin') {
        return;
      }
      const input = document.getElementById('typeImageFile');
      if (input) {
        input.click();
      }
    }

    function syncTypeLocationFromSelectedEvent() {
      const select = document.getElementById('typeEventId');
      const location = document.getElementById('typeLocation');
      if (!select || !location) {
        return;
      }
      const option = select.options[select.selectedIndex];
      location.value = option && option.value ? (option.dataset.location || '') : '';
    }

    function resetTypeForm(options) {
      const config = options || {};
      document.getElementById('editingTypeId').value = '';
      document.getElementById('typeFormTitle').textContent = 'Crear tipo de ticket';
      document.getElementById('saveTypeBtn').textContent = 'Crear tipo';
      document.getElementById('cancelTypeBtn').style.display = 'none';
      document.getElementById('typeName').value = '';
      document.getElementById('typePrice').value = '';
      document.getElementById('typeQty').value = '';
      document.getElementById('typeMaxPerson').value = '';
      document.getElementById('typeEventId').value = '';
      document.getElementById('typeCategory').value = '';
      document.getElementById('typeImageFile').value = '';
      currentTypeImageData = '';
      renderTypeImagePreview('');
      setTypeImageControls('', DEFAULT_TYPE_IMAGE_HELP);
      syncTypeLocationFromSelectedEvent();
      if (!config.keepMessage) {
        setMsg('catalogMsg', '', 'info');
      }
    }

    function createInfoBlock(label, value) {
      const block = document.createElement('div');
      block.className = 'typeStat';
      const title = document.createElement('strong');
      title.textContent = label;
      const content = document.createElement('span');
      content.textContent = value;
      block.appendChild(title);
      block.appendChild(content);
      return block;
    }

    function createTypeChip(label, className) {
      const chip = document.createElement('span');
      chip.className = 'typeChip ' + className;
      chip.textContent = label;
      return chip;
    }

    function getAvailabilityState(ticketType) {
      const total = Math.max(0, Number(ticketType.quantity || 0));
      const sold = Math.max(0, Number(ticketType.quantitySold || 0));
      const available = Math.max(0, total - sold);
      const ratio = total > 0 ? (available / total) : 0;
      const isActive = ticketType.isActive !== false;

      if (!isActive) {
        return {
          total: total,
          sold: sold,
          available: available,
          ratioPercent: Math.max(0, Math.min(100, Math.round(ratio * 100))),
          chipClass: 'archived',
          barClass: 'archived',
          label: 'Archivado',
        };
      }

      if (available <= 0) {
        return {
          total: total,
          sold: sold,
          available: available,
          ratioPercent: 0,
          chipClass: 'stock-empty',
          barClass: 'empty',
          label: 'Agotado',
        };
      }

      if (available <= Math.max(2, Math.ceil(total * 0.2))) {
        return {
          total: total,
          sold: sold,
          available: available,
          ratioPercent: Math.max(6, Math.min(100, Math.round(ratio * 100))),
          chipClass: 'stock-low',
          barClass: 'low',
          label: 'Ultimos cupos',
        };
      }

      return {
        total: total,
        sold: sold,
        available: available,
        ratioPercent: Math.max(8, Math.min(100, Math.round(ratio * 100))),
        chipClass: 'stock-ok',
        barClass: '',
        label: 'Disponible',
      };
    }

    function renderTypesOverview(list) {
      const container = document.getElementById('typesOverview');
      if (!container) {
        return;
      }

      const items = Array.isArray(list) ? list : [];
      const total = items.length;
      const active = items.filter(function(item) { return item.isActive !== false; }).length;
      const archived = items.filter(function(item) { return item.isActive === false; }).length;
      const soldOut = items.filter(function(item) {
        const availability = getAvailabilityState(item);
        return item.isActive !== false && availability.available <= 0;
      }).length;

      const summary = [
        { label: 'Total tipos', value: total },
        { label: 'Activos', value: active },
        { label: 'Agotados', value: soldOut },
        { label: 'Archivados', value: archived },
      ];

      container.innerHTML = '';
      summary.forEach(function(entry) {
        const card = document.createElement('div');
        card.className = 'typeOverviewItem';
        const label = document.createElement('strong');
        label.textContent = entry.label;
        const value = document.createElement('span');
        value.textContent = String(entry.value);
        card.appendChild(label);
        card.appendChild(value);
        container.appendChild(card);
      });
    }

    function readFileAsDataUrl(file) {
      return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() { resolve(String(reader.result || '')); };
        reader.onerror = function() { reject(new Error('No se pudo leer la imagen seleccionada.')); };
        reader.readAsDataURL(file);
      });
    }

    function resolveHeicTicketConverter() {
      if (typeof window.heic2any === 'function') {
        return window.heic2any;
      }
      if (typeof heic2any === 'function') {
        return heic2any;
      }
      return null;
    }

    function isHeicTicketImageFile(file) {
      const normalizedType = String(file && file.type ? file.type : '').trim().toLowerCase();
      const normalizedName = String(file && file.name ? file.name : '').trim().toLowerCase();
      return normalizedType === 'image/heic'
        || normalizedType === 'image/heif'
        || normalizedName.endsWith('.heic')
        || normalizedName.endsWith('.heif');
    }

    function isSupportedTicketImageFile(file) {
      const normalizedType = String(file && file.type ? file.type : '').trim().toLowerCase();
      const normalizedName = String(file && file.name ? file.name : '').trim().toLowerCase();
      if (['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/heic', 'image/heif'].includes(normalizedType)) {
        return true;
      }
      return /\.(jpg|jpeg|png|webp|svg|heic|heif)$/i.test(normalizedName);
    }

    async function convertHeicTicketImageFile(file) {
      const converter = resolveHeicTicketConverter();
      if (typeof converter !== 'function') {
        throw new Error('La conversion HEIC local aun no esta lista. Recarga la vista e intenta de nuevo.');
      }

      let converted = null;
      try {
        converted = await converter({
          blob: file,
          toType: 'image/jpeg',
          quality: 0.92,
        });
      } catch (_error) {
        throw new Error('No se pudo convertir la imagen HEIC/HEIF automaticamente. Prueba con otra foto o conviertela a JPG/PNG.');
      }

      const candidate = Array.isArray(converted) ? converted[0] : converted;
      if (!(candidate instanceof Blob)) {
        throw new Error('La imagen HEIC/HEIF no se pudo convertir a un formato compatible.');
      }

      return candidate.type ? candidate : new Blob([candidate], { type: 'image/jpeg' });
    }

    function renderTicketImageCandidate(image, maxEdge, quality) {
      const width = Number(image.width || 1);
      const height = Number(image.height || 1);
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('No se pudo procesar la imagen.');
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    }

    async function optimizeTypeImageFile(file) {
      let sourceBlob = file;
      let normalizedType = String(file.type || '').toLowerCase();

      if (isHeicTicketImageFile(file)) {
        sourceBlob = await convertHeicTicketImageFile(file);
        normalizedType = 'image/jpeg';
      }

      const source = await readFileAsDataUrl(sourceBlob);
      if (normalizedType === 'image/svg+xml') {
        if (source.length > MAX_TICKET_IMAGE_SIZE) {
          throw new Error('La imagen SVG es demasiado pesada. Exportala mas ligera o usa PNG/JPG.');
        }
        return source;
      }

      return await new Promise(function(resolve, reject) {
        const image = new Image();
        image.onload = function() {
          try {
            const longestEdge = Math.max(Number(image.width || 1), Number(image.height || 1));
            let maxEdge = Math.min(longestEdge, 1600);
            let quality = 0.9;
            let bestCandidate = '';

            for (let attempt = 0; attempt < 8; attempt += 1) {
              const candidate = renderTicketImageCandidate(image, maxEdge, quality);
              bestCandidate = candidate;
              if (candidate.length <= MAX_TICKET_IMAGE_SIZE) {
                resolve(candidate);
                return;
              }

              if (maxEdge <= 320 && quality <= 0.55) {
                break;
              }

              maxEdge = Math.max(320, Math.round(maxEdge * 0.82));
              quality = Math.max(0.55, Number((quality - 0.08).toFixed(2)));
            }

            if (bestCandidate && bestCandidate.length <= MAX_TICKET_IMAGE_SIZE) {
              resolve(bestCandidate);
              return;
            }

            reject(new Error('No se pudo adaptar la imagen automaticamente. Prueba con una foto mas ligera o recortada.'));
          } catch (error) {
            reject(error instanceof Error ? error : new Error('No se pudo procesar la imagen.'));
          }
        };
        image.onerror = function() { reject(new Error('No se pudo procesar la imagen seleccionada.')); };
        image.src = source;
      });
    }

    async function handleTypeImageChange(event) {
      const input = event && event.target ? event.target : document.getElementById('typeImageFile');
      const file = input && input.files ? input.files[0] : null;
      if (!file) {
        return;
      }
      if (!isSupportedTicketImageFile(file)) {
        input.value = '';
        setTypeImageControls(currentTypeImageData ? 'Imagen actual preparada.' : '', currentTypeImageData ? 'Se mantiene la imagen actual. Elige JPG, PNG, WebP o SVG.' : DEFAULT_TYPE_IMAGE_HELP);
        setMsg('catalogMsg', 'Selecciona un archivo de imagen valido.', 'err');
        return;
      }

      const previousImage = currentTypeImageData;
      try {
        const isHeicSelection = isHeicTicketImageFile(file);
        setTypeImageControls(file.name || 'Foto seleccionada.', isHeicSelection ? 'Convirtiendo HEIC/HEIF a JPG y ajustando la foto para la card...' : 'Ajustando resolucion y peso de la foto para la card...');
        setMsg('catalogMsg', isHeicSelection ? 'Convirtiendo foto HEIC/HEIF para la tarjeta...' : 'Preparando foto para la tarjeta...', 'info');
        const optimizedImage = await optimizeTypeImageFile(file);
        if (optimizedImage.length > MAX_TICKET_IMAGE_SIZE) {
          throw new Error('La imagen es demasiado grande. Usa una foto mas ligera.');
        }
        currentTypeImageData = optimizedImage;
        renderTypeImagePreview(currentTypeImageData);
        setTypeImageControls(file.name || 'Foto preparada.', document.getElementById('editingTypeId').value.trim() ? 'Foto optimizada. Pulsa Guardar cambios para persistirla.' : 'Foto optimizada. Pulsa Crear tipo para persistirla.');
        setMsg('catalogMsg', document.getElementById('editingTypeId').value.trim() ? 'Foto optimizada. Pulsa Guardar cambios para persistirla.' : 'Foto optimizada. Pulsa Crear tipo para persistirla.', 'info');
      } catch (error) {
        currentTypeImageData = previousImage;
        renderTypeImagePreview(currentTypeImageData);
        input.value = '';
        setTypeImageControls(previousImage ? 'Imagen actual preparada.' : '', previousImage ? 'Se mantuvo la imagen anterior. Intenta con otra foto.' : DEFAULT_TYPE_IMAGE_HELP);
        setMsg('catalogMsg', error instanceof Error ? error.message : 'No se pudo procesar la imagen.', 'err');
      }
    }

    function removeTypeImage() {
      if (userRole !== 'admin') {
        return;
      }
      currentTypeImageData = '';
      document.getElementById('typeImageFile').value = '';
      renderTypeImagePreview('');
      setTypeImageControls('Sin foto seleccionada.', 'La card quedara sin imagen cuando guardes el ticket.');
      setMsg('catalogMsg', 'La foto se quitara cuando guardes el ticket.', 'info');
    }

    function populateTypeForm(ticketType) {
      if (!ticketType) {
        return;
      }
      document.getElementById('editingTypeId').value = ticketType.id || '';
      document.getElementById('typeFormTitle').textContent = 'Editar tipo de ticket';
      document.getElementById('saveTypeBtn').textContent = 'Guardar cambios';
      document.getElementById('cancelTypeBtn').style.display = 'inline-flex';
      document.getElementById('typeName').value = ticketType.name || '';
      document.getElementById('typePrice').value = String(Number(ticketType.price || 0));
      document.getElementById('typeQty').value = String(Number(ticketType.quantity || 0));
      document.getElementById('typeMaxPerson').value = String(Number(ticketType.maxPerPerson || 0));
      document.getElementById('typeEventId').value = ticketType.eventId || '';
      document.getElementById('typeCategory').value = ticketType.category || '';
      document.getElementById('typeImageFile').value = '';
      currentTypeImageData = ticketType.teamImageUrl || '';
      renderTypeImagePreview(currentTypeImageData);
      setTypeImageControls(currentTypeImageData ? 'Foto actual guardada.' : '', currentTypeImageData ? 'Puedes reemplazarla o quitarla antes de guardar los cambios.' : EMPTY_SAVED_IMAGE_HELP);
      syncTypeLocationFromSelectedEvent();
      setMsg('catalogMsg', 'Editando el ticket seleccionado. Puedes cambiar tambien la foto.', 'info');
      showTab('catalog');
      document.getElementById('createTypeForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function renderTypeCard(ticketType) {
      const eventMatch = eventsCache.find(function(item) { return item.id === ticketType.eventId; });
      const eventTitle = eventMatch
        ? eventMatch.title
        : (ticketType.eventId ? String(ticketType.eventId).substring(0, 8) + '...' : 'Sin evento vinculado');
      const eventLocation = eventMatch ? (eventMatch.location || '-') : '-';
      const isActive = ticketType.isActive !== false;
      const availability = getAvailabilityState(ticketType);

      const article = document.createElement('article');
      article.className = 'typeCard' + (isActive ? '' : ' archived');

      const media = document.createElement('div');
      media.className = 'typeCardMedia';
      if (ticketType.teamImageUrl) {
        const image = document.createElement('img');
        image.loading = 'lazy';
        image.decoding = 'async';
        image.src = ticketType.teamImageUrl;
        image.alt = 'Foto del equipo para ' + (ticketType.name || 'ticket');
        image.onload = function() {
          applyTicketImageFrameClass(media, image);
        };
        image.onerror = function() {
          clearTicketImageFrameClass(media);
        };
        if (image.complete) {
          applyTicketImageFrameClass(media, image);
        }
        media.appendChild(image);
      } else {
        const fallback = document.createElement('div');
        fallback.className = 'typeCardFallback';
        fallback.textContent = 'Sin foto guardada';
        media.appendChild(fallback);
      }

      const body = document.createElement('div');
      body.className = 'typeCardBody';

      const head = document.createElement('div');
      head.className = 'typeCardHead';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'typeCardTitleWrap';
      const title = document.createElement('h3');
      title.className = 'typeCardTitle';
      title.textContent = ticketType.name || '-';
      const meta = document.createElement('div');
      meta.className = 'typeMetaRow';
      meta.appendChild(createTypeChip(ticketType.category || 'Sin categoria', 'category'));
      meta.appendChild(createTypeChip(eventTitle, 'event'));
      meta.appendChild(createTypeChip(availability.label, availability.chipClass));
      const subtitle = document.createElement('div');
      subtitle.className = 'typeCardSubtitle';
      subtitle.textContent = eventLocation || '-';
      titleWrap.appendChild(title);
      titleWrap.appendChild(meta);
      titleWrap.appendChild(subtitle);

      const priceWrap = document.createElement('div');
      priceWrap.className = 'typeCardPriceWrap';
      const price = document.createElement('div');
      price.className = 'typeCardPrice';
      price.textContent = '$' + Number(ticketType.price || 0).toFixed(2);
      const status = document.createElement('span');
      status.className = 'typeStatus ' + (isActive ? 'active' : 'archived');
      status.textContent = isActive ? 'Activo' : 'Archivado';
      priceWrap.appendChild(price);
      priceWrap.appendChild(status);

      head.appendChild(titleWrap);
      head.appendChild(priceWrap);

  const availabilityBlock = document.createElement('div');
  availabilityBlock.className = 'typeAvailability';
  const availabilityHead = document.createElement('div');
  availabilityHead.className = 'typeAvailabilityHead';
  const availabilityLabel = document.createElement('div');
  availabilityLabel.className = 'typeAvailabilityLabel';
  availabilityLabel.textContent = availability.label;
  const availabilityValue = document.createElement('div');
  availabilityValue.className = 'typeAvailabilityValue';
  availabilityValue.textContent = String(availability.available) + ' disponibles de ' + String(availability.total);
  availabilityHead.appendChild(availabilityLabel);
  availabilityHead.appendChild(availabilityValue);
  const availabilityBar = document.createElement('div');
  availabilityBar.className = 'typeAvailabilityBar';
  const availabilityFill = document.createElement('div');
  availabilityFill.className = 'typeAvailabilityFill' + (availability.barClass ? (' ' + availability.barClass) : '');
  availabilityFill.style.width = String(availability.ratioPercent) + '%';
  availabilityBar.appendChild(availabilityFill);
  availabilityBlock.appendChild(availabilityHead);
  availabilityBlock.appendChild(availabilityBar);

      const stats = document.createElement('div');
      stats.className = 'typeStats';
  stats.appendChild(createInfoBlock('Vendidos', String(availability.sold)));
  stats.appendChild(createInfoBlock('Disponibles', String(availability.available) + ' / ' + String(availability.total)));
      stats.appendChild(createInfoBlock('Max/persona', Number(ticketType.maxPerPerson || 0) > 0 ? String(Number(ticketType.maxPerPerson || 0)) : 'Sin limite'));

      const info = document.createElement('div');
      info.className = 'typeInfoGrid';
      info.appendChild(createInfoBlock('Evento', eventTitle));
      info.appendChild(createInfoBlock('Ubicacion', eventLocation || '-'));
      info.appendChild(createInfoBlock('Categoria', ticketType.category || 'Sin categoria'));

      const details = document.createElement('div');
      details.className = 'typeCardDetails';
      details.appendChild(stats);
      details.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'typeCardActions';
      if (userRole === 'admin') {
        if (!isActive) {
          const restoreButton = document.createElement('button');
          restoreButton.className = 'ghost';
          restoreButton.type = 'button';
          restoreButton.textContent = 'Reactivar';
          restoreButton.onclick = function() { restoreType(ticketType.id); };
          actions.appendChild(restoreButton);
        } else {
          const editButton = document.createElement('button');
          editButton.className = 'ghost';
          editButton.type = 'button';
          editButton.textContent = 'Editar';
          editButton.onclick = function() { editType(ticketType.id); };
          const deleteButton = document.createElement('button');
          deleteButton.className = 'danger';
          deleteButton.type = 'button';
          deleteButton.textContent = Number(ticketType.quantitySold || 0) > 0 ? 'Archivar' : 'Eliminar';
          deleteButton.onclick = function() { deleteType(ticketType.id); };
          actions.appendChild(editButton);
          actions.appendChild(deleteButton);
        }
      } else {
        const note = document.createElement('div');
        note.className = 'small';
        note.textContent = 'Catalogo en modo solo lectura.';
        actions.appendChild(note);
      }

      body.appendChild(head);
        body.appendChild(availabilityBlock);
        body.appendChild(details);
      body.appendChild(actions);

      article.appendChild(media);
      article.appendChild(body);
      return article;
    }

    function showTab(name) {
      if (!canAccessTab(name)) {
        name = userRole === 'admin' ? 'catalog' : 'catalog';
      }

      ['catalog','buy','orders','ticket','summary'].forEach(function(tab){
        document.getElementById('panel-' + tab).classList.remove('active');
        document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.remove('active');
      });
      document.getElementById('panel-' + name).classList.add('active');
      document.getElementById('tab' + name.charAt(0).toUpperCase() + name.slice(1)).classList.add('active');
      if (name === 'ticket') {
        loadPurchased();
      }
      if (name === 'orders') {
        if (userRole === 'standard') {
          renderCartPanel();
          // Auto-verificar pagos pendientes al abrir la pestaña
          setTimeout(function() {
            const rows = document.querySelectorAll('#ordersRows tr');
            const hasPendingMp = Array.from(rows).some(function(tr) {
              return tr.textContent && tr.textContent.includes('Verificando pago');
            });
            if (hasPendingMp) {
              verifyPendingPayments();
            }
          }, 800);
        } else {
          loadOrders();
        }
      }
      if (name === 'summary') loadSummary();
    }

    function applyRoleUi() {
      const isAdmin = userRole === 'admin';
      const isStandard = userRole === 'standard';
      document.getElementById('createTypeForm').style.display = isAdmin ? 'grid' : 'none';
      document.getElementById('typesOverview').style.display = isAdmin ? 'grid' : 'none';
      document.getElementById('typesCards').style.display = isAdmin ? 'grid' : 'none';
      document.getElementById('clientFilterBar').style.display = isStandard ? 'flex' : 'none';
      document.getElementById('clientCatalogGrid').style.display = isStandard ? 'grid' : 'none';
      document.getElementById('cartSection').style.display = isStandard ? 'block' : 'none';
      document.getElementById('ordersHeading').style.display = isStandard ? 'none' : 'block';
      document.getElementById('ordersEmail').style.display = isAdmin ? 'inline-block' : 'none';
      document.getElementById('tabSummary').style.display = isAdmin ? 'inline-block' : 'none';
      document.getElementById('tabBuy').style.display = 'none';
      document.getElementById('tabOrders').style.display = (isAdmin || isStandard) ? 'inline-block' : 'none';
      document.getElementById('tabTicket').style.display = isStandard ? 'inline-block' : 'none';

      if (isAdmin) { showTab('catalog'); return; }
      if (isStandard) { showTab('catalog'); return; }
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
      availableTypes.forEach(function(t) {
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

    async function loadTypes(options) {
      const config = options || {};
      if (!config.keepMessage) {
        setMsg('catalogMsg', '', 'info');
      }
      try {
        const params = new URLSearchParams();
        if (userRole === 'admin') {
          params.set('includeInactive', 'true');
          const organizerId = String(sessionUser?.sub || sessionUser?.id || '').trim();
          const organizerEmail = String(sessionUser?.email || '').trim().toLowerCase();
          if (organizerId) params.set('organizerId', organizerId);
          if (organizerEmail) params.set('organizerEmail', organizerEmail);
        }
        const qs = params.toString();
        const url = API + '/types' + (qs ? '?' + qs : '');
        const r = await apiFetch(url, { headers: authHeaders(), cache: 'no-store' });
        const d = await r.json().catch(function() { return []; });
        if (!r.ok) throw new Error(d.message || 'No se pudo cargar tipos');
        typesCache = Array.isArray(d) ? d : [];
        renderTypesOverview(typesCache);

        const cards = document.getElementById('typesCards');
        cards.innerHTML = '';
        if (!typesCache.length) {
          cards.innerHTML = '<div class="emptyTypeState">No hay tipos de ticket registrados todavia.</div>';
          if (!config.keepMessage) {
            setMsg('catalogMsg', 'No hay tipos de ticket registrados todavia.', 'info');
          }
          fillTypeSelect();
          return;
        }

        typesCache.forEach(function(ticketType) {
          cards.appendChild(renderTypeCard(ticketType));
        });
        fillTypeSelect();
        if (userRole === 'standard') renderClientCatalog(typesCache);
      } catch (e) {
        setMsg('catalogMsg', e.message, 'err');
      }
    }

    async function createType() {
      if (userRole !== 'admin') {
        return;
      }

      const editingId = document.getElementById('editingTypeId').value.trim();
      const body = {
        name: document.getElementById('typeName').value.trim(),
        price: Number(document.getElementById('typePrice').value || 0),
        quantity: Number(document.getElementById('typeQty').value || 0),
        maxPerPerson: Number(document.getElementById('typeMaxPerson').value || 0),
        eventId: document.getElementById('typeEventId').value.trim() || undefined,
        category: document.getElementById('typeCategory').value.trim() || undefined,
        teamImageUrl: editingId ? (currentTypeImageData || null) : (currentTypeImageData || undefined),
      };
      if (!body.name || body.price <= 0 || body.quantity <= 0 || body.maxPerPerson < 0) {
        setMsg('catalogMsg', 'Completa nombre, precio, cantidad y max/persona validos.', 'err');
        return;
      }

      try {
        const r = await apiFetch(API + '/types' + (editingId ? '/' + editingId : ''), {
          method: editingId ? 'PUT' : 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(body),
        });
        const d = await r.json().catch(function() { return {}; });
        if (!r.ok) throw new Error(d.message || 'No se pudo guardar el tipo');
        const requestedImageSave = Boolean(currentTypeImageData);
        const requestedImageRemoval = Boolean(editingId) && body.teamImageUrl === null;
        const persistedImage = typeof d.teamImageUrl === 'string' && d.teamImageUrl.trim().length > 0;

        if (requestedImageSave && !persistedImage) {
          setMsg('catalogMsg', 'El ticket se guardó, pero la foto no quedó persistida. Intenta guardar de nuevo.', 'err');
          await loadTypes({ keepMessage: true });
          return;
        }

        let successMessage = editingId ? 'Tipo actualizado correctamente.' : 'Tipo de ticket creado en PostgreSQL.';
        if (requestedImageSave && persistedImage) {
          successMessage += ' Foto guardada correctamente.';
        } else if (requestedImageRemoval && !persistedImage) {
          successMessage += ' Foto eliminada correctamente.';
        }

        setMsg('catalogMsg', successMessage, 'ok');
        resetTypeForm({ keepMessage: true });
        await loadTypes({ keepMessage: true });
      } catch (e) {
        setMsg('catalogMsg', e.message, 'err');
      }
    }

    async function editType(id) {
      if (userRole !== 'admin') return;
      const current = typesCache.find(function(x) { return x.id === id; });
      if (!current) return;
      populateTypeForm(current);
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
        await loadTypes({ keepMessage: true });
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
        await loadTypes({ keepMessage: true });
      } catch (e) {
        setMsg('catalogMsg', e.message, 'err');
      }
    }

    // ── Cart & client catalog functions ──

    function getAvailableForType(t) {
      return Math.max(0, Number(t.quantity || 0) - Number(t.quantitySold || 0));
    }

    function addToCart(typeId) {
      const t = typesCache.find(function(x){ return x.id === typeId; });
      if (!t) return;
      if (cart[typeId]) {
        const max = t.maxPerPerson > 0 ? t.maxPerPerson : getAvailableForType(t);
        cart[typeId].qty = Math.min(cart[typeId].qty + 1, max);
      } else {
        cart[typeId] = { type: t, qty: 1 };
      }
      updateCartBadges();
      renderClientCatalog(typesCache);
      showTab('orders');
    }

    function removeFromCart(typeId) {
      delete cart[typeId];
      updateCartBadges();
      renderClientCatalog(typesCache);
      renderCartPanel();
    }

    function clearCart() {
      cart = {};
      updateCartBadges();
      renderClientCatalog(typesCache);
      renderCartPanel();
    }

    function updateCartBadges() {
      const count = Object.keys(cart).length;
      const tab = document.getElementById('tabOrders');
      if (tab) tab.textContent = count > 0 ? ('Ordenes (' + count + ')') : 'Ordenes';
    }

    function renderClientCatalog(types) {
      const grid = document.getElementById('clientCatalogGrid');
      if (!grid) return;
      grid.innerHTML = '';
      const active = types.filter(function(t){ return t.isActive !== false && getAvailableForType(t) > 0; });
      if (!active.length) {
        grid.innerHTML = '<div class="emptyTypeState">No hay tickets disponibles en este momento.</div>';
        return;
      }
      const filtered = applyClientFilters(active);
      if (!filtered.length) {
        grid.innerHTML = '<div class="emptyTypeState">No hay tickets que coincidan con los filtros.</div>';
        return;
      }
      filtered.forEach(function(t) {
        grid.appendChild(buildCompactCard(t));
      });
    }

    function applyClientFilters(types) {
      const search = String((document.getElementById('cfSearch') || {value:''}).value || '').toLowerCase().trim();
      const priceMin = Number((document.getElementById('cfPriceMin') || {value:''}).value || 0);
      const priceMax = Number((document.getElementById('cfPriceMax') || {value:''}).value || 0);
      const sort = (document.getElementById('cfSort') || {value:''}).value || '';
      let result = types.filter(function(t) {
        if (search && !String(t.name || '').toLowerCase().includes(search)) return false;
        const price = Number(t.price || 0);
        if (priceMin > 0 && price < priceMin) return false;
        if (priceMax > 0 && price > priceMax) return false;
        return true;
      });
      if (sort === 'price-asc') result.sort(function(a,b){ return Number(a.price||0) - Number(b.price||0); });
      else if (sort === 'price-desc') result.sort(function(a,b){ return Number(b.price||0) - Number(a.price||0); });
      else if (sort === 'name-asc') result.sort(function(a,b){ return String(a.name||'').localeCompare(String(b.name||'')); });
      else if (sort === 'avail-desc') result.sort(function(a,b){ return getAvailableForType(b) - getAvailableForType(a); });
      return result;
    }

    function filterClientCatalog() { renderClientCatalog(typesCache); }

    function buildCompactCard(t) {
      const avail = getAvailableForType(t);
      const eventMatch = eventsCache.find(function(e){ return e.id === t.eventId; });
      const eventTitle = eventMatch ? eventMatch.title : (t.eventId ? 'Evento vinculado' : 'Sin evento');
      const inCart = Boolean(cart[t.id]);
      const availClass = avail === 0 ? 'avail-empty' : (avail <= 3 ? 'avail-low' : 'avail-ok');
      const availLabel = avail === 0 ? 'Agotado' : (avail <= 3 ? 'Pocas unidades' : 'Disponible');

      const card = document.createElement('article');
      card.className = 'cc-card';

      const imgWrap = document.createElement('div');
      imgWrap.className = 'cc-img';
      if (t.teamImageUrl) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = t.teamImageUrl;
        img.alt = t.name || 'ticket';
        imgWrap.appendChild(img);
      } else {
        const fb = document.createElement('div');
        fb.className = 'cc-img-fallback';
        fb.textContent = t.name || 'Sin foto';
        imgWrap.appendChild(fb);
      }

      const body = document.createElement('div');
      body.className = 'cc-body';

      const name = document.createElement('div');
      name.className = 'cc-name';
      name.title = t.name || '-';
      name.textContent = t.name || '-';

      const evLabel = document.createElement('div');
      evLabel.className = 'cc-event';
      evLabel.title = eventTitle;
      evLabel.textContent = eventTitle;

      const chips = document.createElement('div');
      chips.className = 'cc-chips';
      if (t.category) {
        const cat = document.createElement('span');
        cat.className = 'cc-chip cat';
        cat.textContent = t.category;
        chips.appendChild(cat);
      }
      const avChip = document.createElement('span');
      avChip.className = 'cc-chip ' + availClass;
      avChip.textContent = availLabel;
      chips.appendChild(avChip);

      body.appendChild(name);
      body.appendChild(evLabel);
      body.appendChild(chips);

      const footer = document.createElement('div');
      footer.className = 'cc-footer';
      const price = document.createElement('div');
      price.className = 'cc-price';
      price.textContent = '$' + Number(t.price || 0).toFixed(2);
      const cartBtn = document.createElement('button');
      cartBtn.className = 'btn-cart' + (inCart ? ' in-cart' : '');
      cartBtn.textContent = inCart ? ('En carrito (' + cart[t.id].qty + ')') : 'Agregar';
      cartBtn.disabled = avail === 0;
      cartBtn.onclick = function() { addToCart(t.id); };
      footer.appendChild(price);
      footer.appendChild(cartBtn);

      // ── Hover overlay ──
      const overlay = document.createElement('div');
      overlay.className = 'cc-hover-overlay';

      const hoName = document.createElement('div');
      hoName.className = 'cc-ho-name';
      hoName.textContent = t.name || '-';

      const hoPrice = document.createElement('div');
      hoPrice.className = 'cc-ho-price';
      hoPrice.textContent = '$' + Number(t.price || 0).toFixed(2);

      const hoRows = document.createElement('div');
      hoRows.className = 'cc-ho-rows';
      function addHoRow(lbl, val) {
        if (!val && val !== 0) return;
        const row = document.createElement('div');
        row.className = 'cc-ho-row';
        const l = document.createElement('span'); l.className = 'cc-ho-lbl'; l.textContent = lbl;
        const v = document.createElement('span'); v.className = 'cc-ho-val'; v.textContent = String(val); v.title = String(val);
        row.appendChild(l); row.appendChild(v);
        hoRows.appendChild(row);
      }
      addHoRow('Disponibles', avail + ' de ' + Number(t.quantity || 0));
      if (Number(t.maxPerPerson) > 0) addHoRow('Máx p/persona', String(t.maxPerPerson));
      if (t.category) addHoRow('Categoría', t.category);
      if (eventMatch) {
        const evDate = eventMatch.startDate
          ? (eventMatch.endDate && eventMatch.endDate !== eventMatch.startDate ? eventMatch.startDate + ' — ' + eventMatch.endDate : eventMatch.startDate)
          : (eventMatch.date ? String(eventMatch.date).substring(0,10) : null);
        if (evDate) addHoRow('Fecha', evDate);
        if (eventMatch.location) addHoRow('Lugar', eventMatch.location);
      }
      if (t.organizerName) addHoRow('Organizador', t.organizerName);

      const ovBtn = document.createElement('button');
      ovBtn.className = 'btn-cart-ov' + (inCart ? ' in-cart' : '');
      ovBtn.textContent = inCart ? ('En carrito (' + cart[t.id].qty + ')') : 'Agregar al carrito';
      ovBtn.disabled = avail === 0;
      ovBtn.onclick = function(e) { e.stopPropagation(); addToCart(t.id); };

      overlay.appendChild(hoName);
      overlay.appendChild(hoPrice);
      overlay.appendChild(hoRows);
      overlay.appendChild(ovBtn);

      card.appendChild(imgWrap);
      card.appendChild(body);
      card.appendChild(footer);
      card.appendChild(overlay);
      return card;
    }

    async function verifyPendingPayments() {
      const btn = document.getElementById('verifyPaymentsBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Verificando...'; }
      try {
        const r = await apiFetch(API + '/mp/check-pending', { headers: authHeaders() });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok) throw new Error(d.message || 'Error al verificar');
        if (d.confirmed > 0) {
          setMsg('cartMsg', '✅ ' + d.message + '. Actualizando...', 'ok');
          await loadOrders();
          renderClientCatalog(typesCache);
        } else {
          setMsg('cartMsg', d.message, 'info');
        }
      } catch (e) {
        setMsg('cartMsg', e.message, 'err');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Verificar mis pagos'; }
      }
    }

    function renderCartPanel() {
      const itemsEl = document.getElementById('cartItems');
      const emptyEl = document.getElementById('cartEmpty');
      const footerEl = document.getElementById('cartFooter');
      const titleEl = document.getElementById('cartTitle');
      if (!itemsEl) return;
      itemsEl.innerHTML = '';
      const keys = Object.keys(cart);
      if (titleEl) titleEl.textContent = 'Carrito (' + keys.length + ' tipos)';
      if (!keys.length) {
        if (emptyEl) emptyEl.style.display = 'block';
        if (footerEl) footerEl.style.display = 'none';
        loadOrders();
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';
      if (footerEl) footerEl.style.display = 'flex';
      keys.forEach(function(typeId) {
        const entry = cart[typeId];
        const t = entry.type;
        const avail = getAvailableForType(t);
        const maxQty = t.maxPerPerson > 0 ? Math.min(t.maxPerPerson, avail) : avail;
        const row = document.createElement('div');
        row.className = 'cart-item';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = true;
        check.dataset.typeId = typeId;
        check.onchange = function() { recalcCartTotal(); };
        const imgWrap = document.createElement('div');
        imgWrap.className = 'cart-item-img';
        if (t.teamImageUrl) {
          const img = document.createElement('img');
          img.src = t.teamImageUrl;
          img.alt = t.name || 'ticket';
          imgWrap.appendChild(img);
        } else {
          imgWrap.textContent = (t.name || '?').charAt(0);
          imgWrap.style.fontSize = '14px'; imgWrap.style.fontWeight = '800'; imgWrap.style.color = '#64748b';
        }
        const info = document.createElement('div');
        info.className = 'cart-item-info';
        const nm = document.createElement('div');
        nm.className = 'cart-item-name';
        nm.textContent = t.name || '-';
        const eventMatch = eventsCache.find(function(e){ return e.id === t.eventId; });
        const sub = document.createElement('div');
        sub.className = 'cart-item-sub';
        sub.textContent = (eventMatch ? eventMatch.title : 'Sin evento') + ' · $' + Number(t.price || 0).toFixed(2) + ' c/u';
        info.appendChild(nm);
        info.appendChild(sub);
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.max = String(maxQty);
        qtyInput.value = String(entry.qty);
        qtyInput.className = 'cart-qty';
        qtyInput.dataset.typeId = typeId;
        qtyInput.oninput = function() {
          const v = Math.max(1, Math.min(maxQty, Number(qtyInput.value) || 1));
          qtyInput.value = String(v);
          cart[typeId].qty = v;
          const priceEl = row.querySelector('.cart-item-price');
          if (priceEl) priceEl.textContent = '$' + (Number(t.price || 0) * v).toFixed(2);
          recalcCartTotal();
          updateCartBadges();
          renderClientCatalog(typesCache);
        };
        const priceEl = document.createElement('div');
        priceEl.className = 'cart-item-price';
        priceEl.textContent = '$' + (Number(t.price || 0) * entry.qty).toFixed(2);
        const removeBtn = document.createElement('button');
        removeBtn.className = 'btn-remove-cart';
        removeBtn.title = 'Quitar del carrito';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = function() { removeFromCart(typeId); };
        row.appendChild(check);
        row.appendChild(imgWrap);
        row.appendChild(info);
        row.appendChild(qtyInput);
        row.appendChild(priceEl);
        row.appendChild(removeBtn);
        itemsEl.appendChild(row);
      });
      recalcCartTotal();
      loadOrders();
    }

    function recalcCartTotal() {
      const totalEl = document.getElementById('cartTotal');
      if (!totalEl) return;
      let total = 0;
      document.querySelectorAll('#cartItems .cart-item').forEach(function(row) {
        const check = row.querySelector('input[type=checkbox]');
        if (!check || !check.checked) return;
        const typeId = check.dataset.typeId;
        const entry = cart[typeId];
        if (entry) total += Number(entry.type.price || 0) * entry.qty;
      });
      totalEl.textContent = '$' + total.toFixed(2);
    }

    async function purchaseSelected() {
      setMsg('cartMsg', '', 'info');
      if (!sessionUser?.sub) { setMsg('cartMsg', 'No hay sesion valida para comprar.', 'err'); return; }
      const selected = [];
      document.querySelectorAll('#cartItems .cart-item').forEach(function(row) {
        const check = row.querySelector('input[type=checkbox]');
        if (!check || !check.checked) return;
        const typeId = check.dataset.typeId;
        const entry = cart[typeId];
        if (entry) selected.push({ typeId: typeId, qty: entry.qty, price: entry.type.price, name: entry.type.name || 'Ticket' });
      });
      if (!selected.length) { setMsg('cartMsg', 'Selecciona al menos un ticket para comprar.', 'err'); return; }

      // Deshabilitar botón mientras se procesa
      const buyBtn = document.getElementById('purchaseBtn');
      if (buyBtn) { buyBtn.disabled = true; buyBtn.textContent = 'Procesando...'; }

      try {
        const r = await apiFetch(API + '/mp/create-preference', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            items: selected,
            userId: sessionUser.sub,
            recipientEmail: sessionUser.email || 'attendee@example.com',
          }),
        });
        const d = await r.json().catch(function(){ return {}; });
        if (!r.ok) throw new Error(d.message || 'No se pudo iniciar el pago con MercadoPago');

        // Redirigir al checkout de MercadoPago
        const checkoutUrl = d.sandbox_init_point || d.init_point;
        if (!checkoutUrl) throw new Error('No se recibio la URL de pago de MercadoPago');
        // Abrir en la pestaña completa (el checkout corre en un iframe, MP bloquea iframes)
        window.open(checkoutUrl, '_blank');
      } catch (e) {
        setMsg('cartMsg', e.message, 'err');
        if (buyBtn) { buyBtn.disabled = false; buyBtn.textContent = 'Comprar seleccionados'; }
      }
    }
    // ── end cart functions ──

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

    async function loadPurchased() {
      setMsg('ticketMsg', '', 'info');
      const grid = document.getElementById('ticketPurchasedGrid');
      if (!grid) return;
      grid.innerHTML = '<div class="emptyTypeState">Cargando tickets comprados...</div>';

      if (userRole !== 'standard') {
        grid.innerHTML = '<div class="emptyTypeState">Esta vista esta disponible solo para participantes.</div>';
        return;
      }

      if (!typesCache.length) {
        await loadTypes({ keepMessage: true });
      }
      if (!eventsCache.length) {
        await loadEvents();
      }

      try {
        const r = await apiFetch(API + '/orders?limit=100', { headers: authHeaders(), cache: 'no-store' });
        const d = await r.json().catch(function(){ return []; });
        if (!r.ok) throw new Error(d.message || 'No se pudieron cargar los tickets comprados');

        const paidOrders = (Array.isArray(d) ? d : []).filter(function(order) {
          const status = String(order.status || '').trim().toLowerCase();
          return ['paid', 'approved', 'succeeded'].includes(status);
        });

        if (!paidOrders.length) {
          grid.innerHTML = '<div class="emptyTypeState">Aun no tienes tickets comprados con pago aprobado.</div>';
          return;
        }

        grid.innerHTML = '';
        paidOrders.forEach(function(order) {
          const typeInfo = typesCache.find(function(ticketType) {
            return ticketType.id === order.ticketTypeId;
          }) || {};
          const eventInfo = eventsCache.find(function(event) {
            return event.id === typeInfo.eventId;
          }) || {};
          const eventDateRaw = eventInfo.startDate || eventInfo.date || '';
          const parsedEventDate = eventDateRaw ? new Date(eventDateRaw) : null;
          const eventDate = parsedEventDate && !Number.isNaN(parsedEventDate.getTime())
            ? parsedEventDate.toLocaleDateString()
            : (eventDateRaw ? String(eventDateRaw).substring(0, 10) : 'Por confirmar');
          const card = document.createElement('article');
          card.className = 'ticketCard';
          card.style.cssText = 'background:#fff;border:1px solid #dbe3f0;border-radius:18px;overflow:hidden;box-shadow:0 10px 24px rgba(15,23,42,.06);display:flex;flex-direction:column;min-height:100%';

          const imageWrap = document.createElement('div');
          imageWrap.style.cssText = 'position:relative;height:180px;background:linear-gradient(135deg,#0f172a,#1e3a8a);display:flex;align-items:center;justify-content:center;overflow:hidden';
          if (typeInfo.teamImageUrl) {
            const img = document.createElement('img');
            img.src = typeInfo.teamImageUrl;
            img.alt = typeInfo.name || order.ticketTypeName || 'Ticket';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover';
            imageWrap.appendChild(img);
          } else {
            const fallback = document.createElement('div');
            fallback.style.cssText = 'font-size:54px';
            fallback.textContent = '🎟';
            imageWrap.appendChild(fallback);
          }

          const paidBadge = document.createElement('span');
          paidBadge.style.cssText = 'position:absolute;top:12px;right:12px;background:#dcfce7;color:#166534;border:1px solid #86efac;font-size:11px;font-weight:800;border-radius:999px;padding:5px 10px';
          paidBadge.textContent = translateOrderStatus(order.status);
          imageWrap.appendChild(paidBadge);

          const body = document.createElement('div');
          body.style.cssText = 'padding:16px;display:flex;flex-direction:column;gap:10px;flex:1';

          const title = document.createElement('h3');
          title.style.cssText = 'margin:0;font-size:22px;line-height:1.1;letter-spacing:-.02em;color:#0f172a';
          title.textContent = typeInfo.name || order.ticketTypeName || 'Ticket comprado';
          body.appendChild(title);

          const eventName = document.createElement('div');
          eventName.style.cssText = 'font-size:14px;color:#475569;font-weight:700';
          eventName.textContent = eventInfo.title || 'Evento vinculado a tu compra';
          body.appendChild(eventName);

          const meta = document.createElement('div');
          meta.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px';
          meta.innerHTML =
            '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc"><div style="font-size:11px;color:#64748b;font-weight:700">Cantidad</div><div style="font-size:18px;font-weight:800;color:#0f172a">' + Number(order.quantity || 1) + '</div></div>' +
            '<div style="border:1px solid #e2e8f0;border-radius:12px;padding:10px;background:#f8fafc"><div style="font-size:11px;color:#64748b;font-weight:700">Total pagado</div><div style="font-size:18px;font-weight:800;color:#0f172a">$' + Number(order.totalAmount || 0).toFixed(2) + '</div></div>';
          body.appendChild(meta);

          const details = document.createElement('div');
          details.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-size:13px;color:#475569';
          details.innerHTML =
            '<div><strong>Evento:</strong> ' + (eventInfo.title || 'Sin nombre disponible') + '</div>' +
            '<div><strong>Fecha:</strong> ' + eventDate + '</div>' +
            '<div><strong>Ubicacion:</strong> ' + (eventInfo.location || 'Por confirmar') + '</div>' +
            '<div><strong>Correo receptor:</strong> ' + (order.recipientEmail || '-') + '</div>' +
            '<div><strong>Orden:</strong> ' + (order.id || '-') + '</div>' +
            '<div><strong>Compra:</strong> ' + (order.createdAt ? new Date(order.createdAt).toLocaleString() : '-') + '</div>';
          body.appendChild(details);

          card.appendChild(imageWrap);
          card.appendChild(body);
          grid.appendChild(card);
        });
      } catch (e) {
        grid.innerHTML = '<div class="emptyTypeState">No fue posible cargar los tickets comprados.</div>';
        setMsg('ticketMsg', e.message, 'err');
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
        const currentValue = sel.value;
        sel.innerHTML = '<option value="">-- Sin evento --</option>';
        eventsCache.forEach(function(e) {
          const op = document.createElement('option');
          op.value = e.id;
          const range = e.startDate && e.endDate ? (e.startDate === e.endDate ? e.startDate : (e.startDate + ' a ' + e.endDate)) : (e.date ? e.date.substring(0,10) : '');
          op.textContent = e.title + (range ? ' — ' + range : '');
          op.dataset.location = e.location || '';
          sel.appendChild(op);
        });
        sel.value = currentValue || '';
        sel.onchange = syncTypeLocationFromSelectedEvent;
        syncTypeLocationFromSelectedEvent();
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
        const buyEmailEl = document.getElementById('buyEmail');
        if (buyEmailEl) buyEmailEl.value = sessionUser.email;
      }
      document.getElementById('typeImageFile').onchange = handleTypeImageChange;
      renderTypeImagePreview(currentTypeImageData);
      resetTypeForm({ keepMessage: true });
      loadEvents();
      loadTypes();
      document.getElementById('buyQty').oninput = calcAmount;
      document.getElementById('buyType').onchange = calcAmount;
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

  // ─── MercadoPago endpoints ───────────────────────────────────────────────

  @Post('mp/create-preference')
  @UseGuards(RoleGuard)
  @Roles('standard')
  async mpCreatePreference(
    @Body()
    body: {
      items: { typeId: string; qty: number; price: number; name: string }[];
      userId: string;
      recipientEmail?: string;
    },
  ) {
    if (!this.mpService.isEnabled()) {
      throw new BadRequestException(
        'El pago con MercadoPago no está habilitado. Configura MP_ACCESS_TOKEN en el servidor.',
      );
    }
    if (!body.items?.length) throw new BadRequestException('No hay items para pagar');
    if (!body.userId?.trim()) throw new BadRequestException('userId requerido');

    let pendingOrders: any[] = [];
    try {
      // Reservar stock: crear órdenes con status "pending_mp"
      pendingOrders = await this.ticketService.createPendingMpOrders({
        items: body.items,
        userId: body.userId,
        recipientEmail: body.recipientEmail,
      });

      // Construir items para MercadoPago (unit_price mínimo 1 para pasar validación MP)
      const mpItems = pendingOrders.map((o) => ({
        id: String(o.ticketTypeId ?? o.id),
        title: String(o.ticketTypeName ?? 'Ticket').substring(0, 256),
        quantity: Number(o.quantity) || 1,
        unit_price: Math.max(1, Number(o.unitPrice) || 0),
        currency_id: 'COP',
      }));

      // externalReference = IDs de órdenes separados por coma
      const externalReference = pendingOrders.map((o) => o.id).join(',');

      const preference = await this.mpService.createPreference(
        mpItems,
        externalReference,
        body.recipientEmail,
      );

      // Guardar externalReference en cada orden para poder verificarla después
      await this.ticketService.setOrdersRef(pendingOrders.map((o) => o.id), externalReference);

      return {
        preferenceId: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
        orderIds: pendingOrders.map((o) => o.id),
      };
    } catch (err) {
      // Si hay órdenes creadas pero MP falló, cancelarlas y devolver stock
      if (pendingOrders.length > 0) {
        await this.ticketService.cancelMpOrders(pendingOrders.map((o) => o.id)).catch(() => {});
      }
      const msg = err?.message ?? err?.cause?.message ?? String(err);
      throw new BadRequestException('Error al crear preferencia de pago: ' + msg);
    }
  }

  @Post('mp/webhook')
  @HttpCode(200)
  async mpWebhook(@Body() body: any, @Req() req: any) {
    const type = body?.type ?? body?.topic;
    if (type !== 'payment') return { ok: true };

    const paymentId = String(body?.data?.id ?? body?.id ?? '').trim();
    if (!paymentId) return { ok: true };

    try {
      const payment = await this.mpService.getPayment(paymentId);
      if (!payment) return { ok: true };

      const externalRef = String(payment.external_reference ?? '').trim();
      const status = String(payment.status ?? '').toLowerCase();

      if (!externalRef) return { ok: true };

      const orderIds = externalRef.split(',').map((s) => s.trim()).filter(Boolean);
      if (status === 'approved') {
        await this.ticketService.confirmMpOrders(orderIds, paymentId);
      } else if (status === 'rejected' || status === 'cancelled') {
        await this.ticketService.cancelMpOrders(orderIds);
      }
    } catch (e) {
      // No relanzar — MP requiere 200 siempre
    }
    return { ok: true };
  }

  /**
   * Verifica en la API de MP si alguna orden pending_mp del usuario ya fue pagada.
   * Confirma automáticamente las que encuentra aprobadas.
   */
  @Get('mp/check-pending')
  @UseGuards(RoleGuard)
  @Roles('standard', 'admin')
  async mpCheckPending(@Req() req: any) {
    const userId = req.user?.sub ?? req.user?.id ?? '';
    if (!userId) throw new BadRequestException('No autenticado');

    const pendingOrders = await this.ticketService.getPendingMpOrdersByUser(userId);
    if (!pendingOrders.length) return { confirmed: 0, pending: 0, message: 'No hay pagos pendientes' };

    // Agrupar por externalRef (guardado en paymentIntentId)
    const groups = new Map<string, string[]>();
    for (const order of pendingOrders) {
      const extRef = (order.paymentIntentId && order.paymentIntentId !== 'mp_pending')
        ? order.paymentIntentId
        : order.id; // fallback: la orden fue creada antes del fix
      const existing = groups.get(extRef) ?? [];
      groups.set(extRef, [...existing, order.id]);
    }

    let confirmed = 0;
    for (const [extRef, orderIds] of groups.entries()) {
      const result = await this.mpService.searchApprovedPaymentByRef(extRef);
      if (result) {
        await this.ticketService.confirmMpOrders(orderIds, result.paymentId);
        confirmed += orderIds.length;
      }
    }

    return {
      confirmed,
      pending: pendingOrders.length - confirmed,
      message: confirmed > 0
        ? `${confirmed} orden(es) confirmadas como pagadas`
        : 'No se encontraron pagos aprobados en MercadoPago',
    };
  }

  @Get('mp/success')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async mpSuccess(@Query() q: any) {
    const paymentId = String(q.payment_id ?? '').trim();
    const status = String(q.status ?? '').trim();
    const extRef = String(q.external_reference ?? '').trim();

    // Confirmar pago si MP redirige con datos (flujo no-webhook)
    if (paymentId && status === 'approved' && extRef) {
      try {
        const orderIds = extRef.split(',').map((s) => s.trim()).filter(Boolean);
        await this.ticketService.confirmMpOrders(orderIds, paymentId);
      } catch (_) {}
    }

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="3;url=http://localhost:3009">
<title>Pago exitoso</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f0fdf4}
.card{background:#fff;border-radius:16px;padding:40px 48px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.09);max-width:420px}
.icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:800;color:#166534;margin-bottom:8px}
.sub{color:#64748b;font-size:14px;line-height:1.6}.btn{display:inline-block;margin-top:22px;padding:10px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px}</style>
</head><body><div class="card"><div class="icon">✅</div>
<div class="title">¡Pago aprobado!</div>
<div class="sub">Tu compra fue procesada correctamente.<br>Redirigiendo a la aplicación en 3 segundos…</div>
<a class="btn" href="http://localhost:3009">Volver ahora</a></div></body></html>`;
  }

  @Get('mp/failure')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async mpFailure(@Query() q: any) {
    const extRef = String(q.external_reference ?? '').trim();
    if (extRef) {
      try {
        const orderIds = extRef.split(',').map((s) => s.trim()).filter(Boolean);
        await this.ticketService.cancelMpOrders(orderIds);
      } catch (_) {}
    }
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="4;url=http://localhost:3009">
<title>Pago fallido</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff1f2}
.card{background:#fff;border-radius:16px;padding:40px 48px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.09);max-width:420px}
.icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:800;color:#be123c;margin-bottom:8px}
.sub{color:#64748b;font-size:14px;line-height:1.6}.btn{display:inline-block;margin-top:22px;padding:10px 28px;background:#e11d48;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px}</style>
</head><body><div class="card"><div class="icon">❌</div>
<div class="title">Pago rechazado</div>
<div class="sub">No se pudo procesar el pago. Tu reserva fue liberada.<br>Redirigiendo en 4 segundos…</div>
<a class="btn" href="http://localhost:3009">Intentar de nuevo</a></div></body></html>`;
  }

  @Get('mp/pending')
  @Header('Content-Type', 'text/html; charset=utf-8')
  mpPending() {
    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="5;url=http://localhost:3009">
<title>Pago pendiente</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fffbeb}
.card{background:#fff;border-radius:16px;padding:40px 48px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.09);max-width:420px}
.icon{font-size:56px;margin-bottom:16px}.title{font-size:22px;font-weight:800;color:#92400e;margin-bottom:8px}
.sub{color:#64748b;font-size:14px;line-height:1.6}.btn{display:inline-block;margin-top:22px;padding:10px 28px;background:#d97706;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px}</style>
</head><body><div class="card"><div class="icon">⏳</div>
<div class="title">Pago pendiente</div>
<div class="sub">Tu pago está siendo procesado. Te notificaremos cuando se confirme.<br>Redirigiendo en 5 segundos…</div>
<a class="btn" href="http://localhost:3009">Volver a la app</a></div></body></html>`;
  }

  // ─── Fin MercadoPago ─────────────────────────────────────────────────────

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
  @UseGuards(RoleGuard)
  @Roles('admin')
  async getTicketTypeAudience(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('includeAdmin') includeAdmin?: string,
  ) {
    const withAdmin = ['true', '1', 'yes'].includes(String(includeAdmin ?? '').toLowerCase());
    return await this.ticketService.getTicketTypeAudienceWithOptions(id, withAdmin, {
      id: req.user?.sub,
      email: req.user?.email,
    });
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
      teamImageUrl?: string;
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
      eventId?: string;
      category?: string;
      maxPerPerson?: number;
      teamImageUrl?: string | null;
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
      ? {
          userId,
          email,
          organizerId: req.user?.sub,
          organizerEmail: req.user?.email,
        }
      : { userId: requesterId };
    return await this.ticketService.getOrders(filters, Number(limit ?? 50));
  }

  @Get('orders/summary')
  @UseGuards(RoleGuard)
  @Roles('admin')
  async ordersSummary(@Req() req: any) {
    return await this.ticketService.getOrdersSummary({
      id: req.user?.sub,
      email: req.user?.email,
    });
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
