import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import { CredentialService } from './credential.service';

@Controller('credentials')
export class CredentialController {
  constructor(private readonly credentialService: CredentialService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi() {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Credential Service</title>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js"></script>
  <style>
    :root{--bg:#f7f8fc;--surface:#ffffff;--text:#0f172a;--muted:#5b6475;--line:#dbe2ee;--brand:#1d4ed8;--brand2:#1e40af;--ok:#166534;--warn:#854d0e;--danger:#b91c1c;--info:#1d4ed8}
    *{box-sizing:border-box}
    body{margin:0;font-family:Manrope,Segoe UI,Tahoma,sans-serif;background:linear-gradient(160deg,#fef3c7 0,#f7f8fc 46%,#dbeafe 100%);color:var(--text)}
    .wrap{max-width:1280px;margin:24px auto;padding:0 16px}
    .hero{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
    .hero h1{margin:0;font-size:34px;letter-spacing:-.03em}
    .hero p{margin:6px 0 0;color:var(--muted)}
    .grid{display:grid;grid-template-columns:1.4fr 1fr;gap:14px;margin-top:16px}
    .stack{display:grid;gap:14px}
    .card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 10px 22px rgba(15,23,42,.06)}
    h2,h3{margin:0 0 8px;letter-spacing:-.02em}
    p{margin:0 0 10px}
    .help{color:var(--muted);font-size:14px}
    .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;gap:8px}
    .row2{display:grid;grid-template-columns:1.2fr .8fr auto;gap:8px}
    input,textarea,button{min-height:42px;padding:10px 12px;border-radius:10px;border:1px solid #c7d2e5;font:inherit}
    input:focus,textarea:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
    button{cursor:pointer;font-weight:800;background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff;border:0}
    button.ghost{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe}
    button.danger{background:#fee2e2;color:var(--danger);border:1px solid #fecaca}
    .msg{display:none;margin-top:10px;padding:10px 12px;border-radius:10px;font-size:14px}
    .msg.show{display:block}
    .msg.ok{background:#ecfdf3;color:var(--ok);border:1px solid #bbf7d0}
    .msg.err{background:#fef2f2;color:var(--danger);border:1px solid #fecaca}
    .msg.info{background:#eff6ff;color:var(--info);border:1px solid #bfdbfe}
    .msg.warn{background:#fef3c7;color:var(--warn);border:1px solid #fde68a}
    .pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800}
    .pill.valid{background:#dcfce7;color:#166534}
    .pill.used{background:#fee2e2;color:#991b1b}
    .pill.revoked{background:#e5e7eb;color:#374151}
    .pill.invalid{background:#fef3c7;color:#92400e}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:13px;color:#334155}
    .meta div{padding:10px;border:1px solid var(--line);border-radius:10px;background:#f8fafc}
    .qrBox{display:grid;place-items:center;min-height:240px;border:1px dashed #c7d2e5;border-radius:14px;background:#f8fafc}
    .qrValue{font-family:Consolas,monospace;word-break:break-all;font-size:12px;color:#475569;margin-top:10px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{padding:10px 8px;border-bottom:1px solid #edf2f8;text-align:left;font-size:13px;vertical-align:top}
    th{font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#64748b}
    .mono{font-family:Consolas,monospace}
    .actions{display:flex;gap:8px;flex-wrap:wrap}
    .small{font-size:12px;color:var(--muted)}
    @media(max-width:1080px){.grid{grid-template-columns:1fr}.row,.row2,.meta{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div>
        <h1>Credential Service</h1>
        <p>Genera credenciales QR, valida accesos y administra revocaciones. El flujo principal debe venir desde <strong>ticket.purchased</strong>; la generación manual queda para soporte o excepciones.</p>
      </div>
      <div class="actions">
        <button id="repairLegacy" class="ghost" type="button">Reparar legacy</button>
        <button id="reload" class="ghost" type="button">Recargar</button>
      </div>
    </div>

    <div id="infraStatus" class="msg show info" style="display:block;margin-top:16px">Cargando estado operativo...</div>

    <div class="grid">
      <div class="stack">
        <section class="card">
          <h3>Generación Manual</h3>
          <p class="help">Uso recomendado solo para soporte. En operación normal, la credencial debe generarse automáticamente al consumir el evento de compra.</p>
          <div class="row">
            <input id="orderItemId" placeholder="orderItemId">
            <input id="ticketTypeId" placeholder="ticketTypeId">
            <input id="attendeeName" placeholder="attendeeName">
            <button id="createBtn">Generar</button>
          </div>
          <div id="createMsg" class="msg"></div>
        </section>

        <section class="card">
          <h3>Validar QR</h3>
          <p class="help">Acepta el valor QR completo o el hash. Si defines <strong>SCANNER_IDS</strong> en el entorno, solo se permitirán scanners pre-registrados.</p>
          <div class="row2">
            <input id="qrCodeHash" placeholder="qrCodeHash o qrCodeValue">
            <input id="scannerId" placeholder="scannerId (ej. gate-A1)">
            <button id="validateBtn">Validar</button>
          </div>
          <div id="validateMsg" class="msg"></div>
        </section>

        <section class="card">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
            <h3>Credenciales</h3>
            <span class="small">VALID / USED / REVOKED</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Attendee</th>
                <th>Order Item</th>
                <th>Ticket</th>
                <th>Estado</th>
                <th>Creada</th>
                <th>Usada</th>
                <th>Scanner</th>
                <th>Revocación</th>
                <th>Hash</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <h3>Vista QR</h3>
          <p class="help">Selecciona una credencial para ver el valor QR, descargarlo o revisar sus metadatos operativos.</p>
          <div class="qrBox"><canvas id="qrCanvas"></canvas></div>
          <div id="previewStatus" style="margin-top:10px"></div>
          <div id="qrValue" class="qrValue">Sin credencial seleccionada.</div>
          <div class="actions" style="margin-top:10px">
            <button id="downloadQr" class="ghost" type="button">Descargar PNG</button>
          </div>
        </section>

        <section class="card">
          <h3>Detalles</h3>
          <div id="previewMeta" class="meta">
            <div>Selecciona una credencial para ver detalles.</div>
            <div>Se mostrarán created_at, used_at, used_by y revocación.</div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <script>
    const dataApi = '/credentials/data';
    const createApi = '/credentials/from-ticket';
    const validateApi = '/credentials/validate';
    const healthApi = '/credentials/health';
    const repairLegacyApi = '/credentials/repair-legacy';
    let currentCredentials = [];
    let selectedCredential = null;

    function setMsg(id, message, type) {
      const el = document.getElementById(id);
      el.className = message ? ('msg show ' + type) : 'msg';
      el.textContent = message || '';
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

    function renderInfraStatus(health) {
      const el = document.getElementById('infraStatus');
      if (!health) {
        el.className = 'msg show err';
        el.style.display = 'block';
        el.textContent = 'No se pudo obtener el estado operativo del servicio.';
        return;
      }

      const rabbit = health.rabbitmq || {};
      const scannerMode = health.scannersRestricted
        ? ('restrictivo (' + (health.allowedScannerCount || 0) + ' scanners)')
        : 'abierto';
      const parts = [
        'Servicio: ' + (health.status || 'unknown').toUpperCase(),
        'RabbitMQ: ' + (rabbit.connected ? 'conectado' : 'sin conexion'),
        'Credenciales: ' + (health.totalCredentials ?? 0),
        'Validas: ' + (health.validCount ?? 0),
        'Usadas: ' + (health.usedCount ?? 0),
        'Revocadas: ' + (health.revokedCount ?? 0),
        'Scanners: ' + scannerMode,
      ];

      if (Number(health.legacyWithoutQr || 0) > 0) {
        parts.push('Legacy sin QR: ' + health.legacyWithoutQr);
      }

      if (rabbit.lastError) {
        parts.push('Ultimo error: ' + rabbit.lastError);
      }

      el.className = 'msg show ' + (rabbit.connected ? 'ok' : 'warn');
      el.style.display = 'block';
      el.textContent = parts.join(' | ');
    }

    async function renderQr(credential) {
      const canvas = document.getElementById('qrCanvas');
      const valueEl = document.getElementById('qrValue');
      const statusEl = document.getElementById('previewStatus');
      const metaEl = document.getElementById('previewMeta');

      if (!credential) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        valueEl.textContent = 'Sin credencial seleccionada.';
        statusEl.innerHTML = '';
        metaEl.innerHTML = '<div>Selecciona una credencial para ver detalles.</div><div>Se mostrarán created_at, used_at, used_by y revocación.</div>';
        return;
      }

      selectedCredential = credential;
      statusEl.innerHTML = statusPill(credential.status);
      valueEl.textContent = credential.qrCodeValue || 'La credencial antigua no tiene qrCodeValue persistido.';
      metaEl.innerHTML = [
        '<div><strong>ID</strong><br>' + credential.id + '</div>',
        '<div><strong>Creada</strong><br>' + fmt(credential.createdAt) + '</div>',
        '<div><strong>Usada</strong><br>' + fmt(credential.usedAt) + '</div>',
        '<div><strong>Scanner</strong><br>' + (credential.usedBy || '-') + '</div>',
        '<div><strong>Revocada</strong><br>' + fmt(credential.revokedAt) + '</div>',
        '<div><strong>Motivo</strong><br>' + (credential.revokeReason || '-') + '</div>'
      ].join('');

      if (!credential.qrCodeValue) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      await QRCode.toCanvas(canvas, credential.qrCodeValue, { width: 220, margin: 1 });
    }

    async function load() {
      try {
        const responses = await Promise.all([
          fetch(dataApi),
          fetch(healthApi).catch(function() { return null; })
        ]);
        const r = responses[0];
        const healthResponse = responses[1];
        const d = await r.json();
        const health = healthResponse ? await healthResponse.json().catch(function(){ return null; }) : null;
        renderInfraStatus(health);
        currentCredentials = Array.isArray(d) ? d : [];
        const rows = document.getElementById('rows');
        rows.innerHTML = '';

        if (currentCredentials.length === 0) {
          rows.innerHTML = '<tr><td colspan="10" class="small">No hay credenciales registradas todavía.</td></tr>';
        }

        currentCredentials.forEach(function(x) {
          const tr = document.createElement('tr');
          const revokeInfo = x.revokedAt ? (fmt(x.revokedAt) + '<br><span class="small">' + (x.revokedBy || '-') + '</span>') : '-';
          const previewBtn = '<button class="ghost" type="button" onclick="previewCredential(\'' + x.id + '\')">Ver QR</button>';
          const revokeBtn = x.status === 'VALID'
            ? '<button class="danger" type="button" onclick="revokeCredential(\'' + x.id + '\')">Revocar</button>'
            : '<span class="small">Sin acción</span>';
          const shortHash = x.qrCodeHash ? x.qrCodeHash.slice(0, 18) + '...' : '-';

          tr.innerHTML =
            '<td>' + x.attendeeName + '</td>' +
            '<td class="mono" title="' + x.orderItemId + '">' + x.orderItemId + '</td>' +
            '<td class="mono" title="' + x.ticketTypeId + '">' + x.ticketTypeId + '</td>' +
            '<td>' + statusPill(x.status) + '</td>' +
            '<td>' + fmt(x.createdAt) + '</td>' +
            '<td>' + fmt(x.usedAt) + '</td>' +
            '<td>' + (x.usedBy || '-') + '</td>' +
            '<td>' + revokeInfo + '</td>' +
            '<td class="mono" title="' + (x.qrCodeHash || '') + '">' + shortHash + '</td>' +
            '<td><div class="actions">' + previewBtn + revokeBtn + '</div></td>';
          rows.appendChild(tr);
        });

        if (selectedCredential) {
          const fresh = currentCredentials.find(function(item) { return item.id === selectedCredential.id; });
          await renderQr(fresh || null);
        }
      } catch (error) {
        const message = error && error.message ? error.message : 'No se pudo cargar la informacion';
        renderInfraStatus(null);
        setMsg('validateMsg', message, 'err');
      }
    }

    async function previewCredential(id) {
      const credential = currentCredentials.find(function(item) { return item.id === id; });
      await renderQr(credential || null);
    }

    async function revokeCredential(id) {
      const revokedBy = prompt('Scanner o usuario que revoca:', 'admin-panel');
      if (revokedBy === null) return;
      const reason = prompt('Motivo de revocación:', 'Fraude o reembolso');
      if (reason === null) return;

      const r = await fetch('/credentials/revoke/' + id, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revokedBy: revokedBy, reason: reason }),
      });
      const d = await r.json().catch(function(){ return {}; });
      if (!r.ok || d.ok === false) {
        setMsg('validateMsg', d.reason || d.message || 'No se pudo revocar la credencial', 'err');
        return;
      }
      setMsg('validateMsg', 'Credencial revocada correctamente.', 'warn');
      await load();
    }

    document.getElementById('createBtn').onclick = async function() {
      setMsg('createMsg', '', 'info');
      const body = {
        orderItemId: document.getElementById('orderItemId').value.trim(),
        ticketTypeId: document.getElementById('ticketTypeId').value.trim(),
        attendeeName: document.getElementById('attendeeName').value.trim(),
      };
      const r = await fetch(createApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(function(){ return {}; });
      if (!r.ok) {
        setMsg('createMsg', d.message || 'Error al crear la credencial', 'err');
        return;
      }
      setMsg('createMsg', 'Credencial creada manualmente para soporte.', 'ok');
      await load();
      await previewCredential(d.id);
    };

    document.getElementById('validateBtn').onclick = async function() {
      const body = {
        qrCodeHash: document.getElementById('qrCodeHash').value.trim(),
        scannerId: document.getElementById('scannerId').value.trim() || 'gate-A1',
      };
      const r = await fetch(validateApi, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(function(){ return {}; });
      if (d.valid) {
        setMsg('validateMsg', 'Check-in OK para ' + d.attendeeName + ' en ' + fmt(d.checkinAt), 'ok');
      } else {
        const msgType = d.status === 'USED' || d.status === 'REVOKED' ? 'warn' : 'err';
        setMsg('validateMsg', (d.status || 'INVALID') + ': ' + (d.reason || 'No valida'), msgType);
      }
      await load();
    };

    document.getElementById('downloadQr').onclick = function() {
      if (!selectedCredential || !selectedCredential.qrCodeValue) {
        return;
      }
      const link = document.createElement('a');
      link.href = document.getElementById('qrCanvas').toDataURL('image/png');
      link.download = 'credential-' + selectedCredential.id + '.png';
      link.click();
    };

    document.getElementById('repairLegacy').onclick = async function() {
      const r = await fetch(repairLegacyApi, { method: 'POST' });
      const d = await r.json().catch(function(){ return {}; });
      if (!r.ok || d.ok === false) {
        setMsg('createMsg', d.reason || d.message || 'No se pudieron reparar credenciales legacy', 'err');
        return;
      }
      setMsg('createMsg', 'Credenciales legacy reparadas: ' + (d.repairedCount || 0), 'info');
      await load();
    };

    document.getElementById('reload').onclick = load;
    load();
    setInterval(function() {
      if (document.visibilityState === 'visible') {
        load();
      }
    }, 15000);
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        load();
      }
    });
  </script>
</body>
</html>`;
  }

  @Get('health')
  async status() {
    return await this.credentialService.getOperationalStatus();
  }

  @Post('from-ticket')
  async createFromTicket(
    @Body() body: { orderItemId: string; ticketTypeId: string; attendeeName: string },
  ) {
    return await this.credentialService.createFromPurchase(body);
  }

  @Post('events/ticket-purchased')
  async ingestPurchaseEvent(
    @Body() body: { orderItemId?: string; ticketTypeId?: string; attendeeName?: string },
  ) {
    return await this.credentialService.ingestPurchaseEvent(body);
  }

  @Post('validate')
  async validate(@Body() body: { qrCodeHash: string; scannerId: string }) {
    return await this.credentialService.validateQr(body.qrCodeHash, body.scannerId);
  }

  @Post('revoke/:id')
  async revoke(
    @Param('id') id: string,
    @Body() body: { revokedBy?: string; reason?: string },
  ) {
    return await this.credentialService.revokeCredential(id, body.revokedBy ?? 'admin-panel', body.reason);
  }

  @Get('summary')
  async summary() {
    return { total: await this.credentialService.countAll() };
  }

  @Post('repair-legacy')
  async repairLegacy(@Query('limit') limit?: string) {
    return await this.credentialService.repairLegacyCredentials(Number(limit ?? 50));
  }

  @Get('data')
  async findAll(@Query('limit') limit?: string) {
    return await this.credentialService.findAll(Number(limit ?? 50));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.credentialService.getCredentialById(id);
  }
}
