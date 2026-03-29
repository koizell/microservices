export function renderNotificationUi() {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Notification Service</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Manrope:wght@400;500;700;800&display=swap" rel="stylesheet">
  <style>
    :root{
      --bg:#f7f0de;
      --ink:#162033;
      --muted:#5e6574;
      --surface:#fffdf8;
      --surface-strong:#ffffff;
      --line:#dde4f0;
      --brand:#dd5b16;
      --brand-dark:#9a3412;
      --accent:#1d4ed8;
      --ok:#166534;
      --warn:#9a6700;
      --err:#b42318;
      --shadow:0 18px 40px rgba(22,32,51,.10);
    }
    *{box-sizing:border-box}
    body{
      margin:0;
      color:var(--ink);
      background:
        radial-gradient(circle at top left, rgba(244,187,68,.34), transparent 34%),
        radial-gradient(circle at 85% 15%, rgba(59,130,246,.22), transparent 28%),
        linear-gradient(180deg, #f7f0de 0%, #eef3fb 100%);
      font-family:Manrope,system-ui,sans-serif;
    }
    .shell{max-width:1240px;margin:0 auto;padding:28px 18px 32px}
    .hero{margin-bottom:16px}
    .hero-card,.card{
      background:rgba(255,253,248,.94);
      border:1px solid rgba(221,228,240,.9);
      border-radius:24px;
      box-shadow:var(--shadow);
      backdrop-filter:blur(10px);
    }
    .hero-card{padding:24px}
    .stats{
      display:grid;
      grid-template-columns:repeat(5,minmax(0,1fr));
      gap:12px;
      padding:18px 20px;
      background:linear-gradient(160deg, rgba(255,255,255,.94), rgba(236,243,255,.95));
    }
    .stat{
      padding:16px;
      border-radius:18px;
      background:rgba(255,255,255,.92);
      border:1px solid rgba(221,228,240,.96);
    }
    .stat span{display:block;color:#64748b;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
    .stat strong{display:block;margin-top:10px;font-family:'Space Grotesk',system-ui,sans-serif;font-size:30px;letter-spacing:-.03em}
    .layout{
      display:grid;
      grid-template-columns:minmax(0,1.3fr) minmax(340px,.9fr);
      gap:16px;
      margin-top:16px;
    }
    .card{padding:20px}
    .card h2{
      margin:0;
      font-family:'Space Grotesk',system-ui,sans-serif;
      font-size:25px;
      letter-spacing:-.03em;
    }
    .sub{margin:8px 0 0;color:var(--muted);font-size:14px;line-height:1.6}
    .toolbar,.stack,.preview-grid{display:grid;gap:12px}
    .toolbar{grid-template-columns:minmax(0,1fr) auto}
    .stack{margin-top:18px}
    .row-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    label{display:grid;gap:8px;font-size:13px;font-weight:800;color:#334155;letter-spacing:.02em;text-transform:uppercase}
    input,select,textarea,button{
      width:100%;
      border-radius:16px;
      border:1px solid #ccd6e7;
      background:#fff;
      color:var(--ink);
      font:inherit;
    }
    input,select{height:50px;padding:0 15px}
    textarea{min-height:170px;padding:14px 15px;resize:vertical;line-height:1.6}
    input:focus,select:focus,textarea:focus{outline:2px solid rgba(29,78,216,.18);border-color:#93c5fd}
    button{
      height:50px;
      padding:0 18px;
      cursor:pointer;
      font-weight:800;
      transition:transform .14s ease, box-shadow .14s ease, opacity .14s ease;
    }
    button:hover{transform:translateY(-1px)}
    button.primary{
      border:0;
      color:#fff;
      background:linear-gradient(135deg,var(--brand),#f97316 55%, #f59e0b);
      box-shadow:0 14px 26px rgba(221,91,22,.24);
    }
    button.ghost{
      background:#fff;
      color:var(--accent);
      border-color:#bfd4ff;
    }
    button.danger{
      background:#fff4f2;
      color:var(--err);
      border-color:#fecaca;
    }
    button:disabled{opacity:.58;cursor:not-allowed;transform:none;box-shadow:none}
    .msg{display:none;border-radius:16px;padding:13px 14px;font-size:14px;line-height:1.55}
    .msg.info,.msg.ok,.msg.err{display:block}
    .msg.info{background:#eef4ff;border:1px solid #cfe0ff;color:#1d4ed8}
    .msg.ok{background:#ecfdf3;border:1px solid #bbf7d0;color:var(--ok)}
    .msg.err{background:#fff1f2;border:1px solid #fecdd3;color:var(--err)}
    .chips{display:flex;flex-wrap:wrap;gap:8px}
    .chip{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:8px 11px;
      border-radius:999px;
      background:#edf4ff;
      color:#1e3a8a;
      border:1px solid #cfe0ff;
      font-size:12px;
      font-weight:800;
    }
    .chip.warm{background:#fff4e8;border-color:#fed7aa;color:var(--brand-dark)}
    .chip.soft{background:#eefbf3;border-color:#ccefd8;color:var(--ok)}
    .chip.muted{background:#f8fafc;border-color:#e2e8f0;color:#475569}
    .kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .kpi{padding:14px;border-radius:18px;background:#fff;border:1px solid var(--line)}
    .kpi span{display:block;font-size:11px;color:#64748b;font-weight:800;letter-spacing:.07em;text-transform:uppercase}
    .kpi strong{display:block;margin-top:8px;font-family:'Space Grotesk',system-ui,sans-serif;font-size:26px}
    .table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:#fff}
    table{width:100%;border-collapse:collapse;min-width:620px}
    th,td{padding:12px 14px;border-bottom:1px solid #eef2f7;text-align:left;font-size:14px;vertical-align:top}
    th{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;background:#faf7ef}
    tr:last-child td{border-bottom:0}
    .empty{padding:24px;border-radius:18px;background:#f8fafc;border:1px dashed #cbd5e1;color:#64748b;text-align:center}
    .history-list{display:grid;gap:10px;margin-top:16px}
    .history-item{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:10px;
      align-items:center;
      padding:14px;
      border-radius:18px;
      background:#fff;
      border:1px solid var(--line);
    }
    .history-item strong{display:block;font-size:15px;line-height:1.45}
    .history-item small{display:block;margin-top:7px;color:var(--muted);font-size:12px;line-height:1.5}
    .actions{display:flex;gap:10px;align-items:center;justify-content:space-between}
    .button-row{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .helper{font-size:12px;color:var(--muted);line-height:1.6}
    .option-card{
      padding:14px 15px;
      border-radius:18px;
      border:1px solid var(--line);
      background:#fff;
      text-transform:none;
      letter-spacing:0;
      font-size:14px;
      font-weight:700;
    }
    .option-row{display:flex;gap:10px;align-items:center}
    .option-row input[type="checkbox"]{width:18px;height:18px;accent-color:var(--accent)}
    .option-card small{display:block;color:var(--muted);font-size:12px;line-height:1.55;font-weight:600}
    .preview-box{
      border:1px solid var(--line);
      border-radius:18px;
      background:#fff;
      padding:14px;
    }
    .preview-list{display:grid;gap:10px;margin-top:12px}
    .preview-item{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto auto;
      gap:10px;
      align-items:center;
      padding:12px 14px;
      border-radius:14px;
      background:#fbfdff;
      border:1px solid #e2e8f0;
    }
    .preview-item strong{display:block;font-size:14px}
    .preview-item small{display:block;margin-top:4px;color:var(--muted);font-size:12px}
    @media (max-width:1080px){
      .stats{grid-template-columns:repeat(3,minmax(0,1fr))}
      .layout{grid-template-columns:1fr}
      .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media (max-width:720px){
      .shell{padding:18px 12px 24px}
      .toolbar,.row-2,.kpis{grid-template-columns:1fr}
      .stats{grid-template-columns:repeat(2,minmax(0,1fr))}
      .history-item{grid-template-columns:1fr}
      .preview-item{grid-template-columns:1fr}
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="hero-card stats">
        <div class="stat">
          <span>Tickets listados</span>
          <strong id="ticketsCount">0</strong>
        </div>
        <div class="stat">
          <span>Audiencia actual</span>
          <strong id="audienceCount">0</strong>
        </div>
        <div class="stat">
          <span>Compradores standard</span>
          <strong id="standardCount">0</strong>
        </div>
        <div class="stat">
          <span>Compradores guest</span>
          <strong id="guestCount">0</strong>
        </div>
        <div class="stat">
          <span>Compradores admin</span>
          <strong id="adminCount">0</strong>
        </div>
      </div>
    </section>

    <section class="layout">
      <div class="card">
        <h2>Enviar notificacion</h2>
        <p class="sub">Esta vista esta pensada para notificaciones manuales del organizador sobre un ticket ya comprado.</p>

        <div class="stack">
          <div class="toolbar">
            <label>
              Ticket objetivo
              <select id="ticketTypeSelect"></select>
            </label>
            <button class="ghost" id="reloadTicketsBtn" type="button">Recargar tickets</button>
          </div>

          <div class="chips" id="audienceMeta">
            <span class="chip muted">Sin ticket seleccionado</span>
          </div>

          <div class="kpis">
            <div class="kpi"><span>Destinatarios</span><strong id="kRecipients">0</strong></div>
            <div class="kpi"><span>Ordenes</span><strong id="kOrders">0</strong></div>
            <div class="kpi"><span>Tickets comprados</span><strong id="kTickets">0</strong></div>
            <div class="kpi"><span>Origen</span><strong id="kSource">-</strong></div>
          </div>

          <div class="preview-grid">
            <label class="option-card">
              <span>Segmentacion</span>
              <div class="option-row">
                <input id="includeAdminToggle" type="checkbox" checked>
                <strong>Incluir compradores admin</strong>
              </div>
              <small>Activalo para compras internas, tickets de QA o pruebas del equipo organizador.</small>
            </label>
            <label>
              Correos de prueba
              <input id="testRecipients" placeholder="qa-uno@example.com, qa-dos@example.com">
            </label>
          </div>

          <div id="campaignMsg" class="msg info">Selecciona un ticket para cargar sus compradores.</div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Comprador</th>
                  <th>Correo destino</th>
                  <th>Rol</th>
                  <th>Ordenes</th>
                  <th>Tickets</th>
                  <th>Ultima compra</th>
                </tr>
              </thead>
              <tbody id="audienceRows">
                <tr><td colspan="6"><div class="empty">Aun no hay audiencia cargada.</div></td></tr>
              </tbody>
            </table>
          </div>

          <div class="row-2">
            <label>
              Asunto
              <input id="campaignSubject" placeholder="Ej. Actualizacion importante sobre tu acceso VIP">
            </label>
            <label>
              Firma del organizador
              <input id="senderName" placeholder="Ej. Equipo EventHive Barranquilla">
            </label>
          </div>

          <label>
            Mensaje personalizado
            <textarea id="campaignMessage" placeholder="Escribe aqui la informacion que recibiran los compradores del ticket seleccionado."></textarea>
          </label>

          <div class="actions">
            <div class="helper">Si escribes correos de prueba, la notificacion se limita a esas direcciones. La simulacion no guarda notificaciones ni usa SMTP.</div>
            <div class="button-row">
              <button class="ghost" id="simulateCampaignBtn" type="button">Simular envio</button>
              <button class="primary" id="sendCampaignBtn" type="button">Enviar notificacion</button>
            </div>
          </div>

          <div class="preview-box" id="deliveryPreview">
            <div class="empty">La simulacion mostrara aqui el modo de entrega, los correos resueltos y el alcance final antes del envio.</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Historial reciente</h2>
        <p class="sub">Ultimas notificaciones guardadas en notification-service.</p>
        <div class="actions" style="margin-top:16px">
          <div class="helper">Se actualiza al enviar una notificacion o al recargar manualmente.</div>
          <button class="ghost" id="reloadHistoryBtn" type="button">Recargar historial</button>
        </div>
        <div class="history-list" id="historyList"></div>
      </div>
    </section>
  </div>

  <script>
    const API = '/notifications';
    let ticketOptions = [];
    let currentAudience = null;

    function safeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function setMsg(id, message, type) {
      const el = document.getElementById(id);
      el.className = message ? ('msg ' + type) : 'msg';
      el.textContent = message || '';
    }

    function formatRole(role) {
      const normalized = String(role || '').trim().toLowerCase();
      if (normalized === 'admin') return 'Organizador';
      if (normalized === 'standard') return 'Participante';
      if (normalized === 'guest') return 'Invitado';
      if (normalized === 'test') return 'Prueba';
      return normalized || '-';
    }

    function isAdminIncluded() {
      return !!document.getElementById('includeAdminToggle').checked;
    }

    function parseEmailInput(value) {
      const seen = new Set();
      return String(value || '')
        .split(/[\n,;]+/)
        .map(function(item) { return item.trim().toLowerCase(); })
        .filter(function(email) {
          if (!email || seen.has(email)) return false;
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
          seen.add(email);
          return true;
        });
    }

    function getAudienceDescriptor() {
      return isAdminIncluded() ? 'participante, invitado o admin' : 'participante o invitado';
    }

    function renderDeliveryPreview(result) {
      const box = document.getElementById('deliveryPreview');
      if (!result) {
        box.innerHTML = '<div class="empty">La simulacion mostrara aqui el modo de entrega, los correos resueltos y el alcance final antes del envio.</div>';
        return;
      }

      const recipients = Array.isArray(result.previewRecipients) ? result.previewRecipients : [];
      const chips = [
        '<span class="chip warm">Modo: ' + safeHtml(result.deliveryMode || '-') + '</span>',
        '<span class="chip soft">Audiencia base: ' + safeHtml(result.totalAudienceRecipients || 0) + '</span>',
        '<span class="chip soft">Entrega final: ' + safeHtml(result.totalResolvedRecipients || 0) + '</span>',
        '<span class="chip muted">Admin incluidos: ' + (result.includeAdmin ? 'si' : 'no') + '</span>'
      ];

      if (Array.isArray(result.usedTestRecipients) && result.usedTestRecipients.length) {
        chips.push('<span class="chip muted">Correos QA: ' + safeHtml(result.usedTestRecipients.length) + '</span>');
      }

      const previewHtml = recipients.length
        ? recipients.map(function(recipient) {
            return '<div class="preview-item">' +
              '<div><strong>' + safeHtml(recipient.name || 'destinatario') + '</strong><small>' + safeHtml(recipient.email || '-') + '</small></div>' +
              '<span class="chip soft">' + safeHtml(formatRole(recipient.accountType)) + '</span>' +
              '<span class="chip muted">' + safeHtml(recipient.deliverySource === 'test' ? 'override QA' : 'audiencia real') + '</span>' +
            '</div>';
          }).join('')
        : '<div class="empty">No hay destinatarios resueltos para esta configuracion.</div>';

      box.innerHTML =
        '<div class="chips">' + chips.join('') + '</div>' +
        '<div class="helper" style="margin-top:12px">' + safeHtml(result.simulated ? 'Simulacion completada. No se guardaron notificaciones ni se enviaron correos.' : 'Ultimo envio ejecutado con la configuracion mostrada.') + '</div>' +
        '<div class="preview-list">' + previewHtml + '</div>';
    }

    function setCampaignButtonsDisabled(disabled) {
      document.getElementById('sendCampaignBtn').disabled = disabled;
      document.getElementById('simulateCampaignBtn').disabled = disabled;
    }

    function formatDate(value) {
      if (!value) return '-';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '-';
      return date.toLocaleString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    async function fetchJson(url, options) {
      const response = await fetch(url, options || {});
      const payload = await response.json().catch(function() { return {}; });
      if (!response.ok) {
        throw new Error(payload.message || payload.reason || ('La solicitud fallo con ' + response.status));
      }
      return payload;
    }

    function renderTicketOptions(selectedId) {
      const select = document.getElementById('ticketTypeSelect');
      select.innerHTML = '';

      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = ticketOptions.length ? '-- Selecciona un ticket --' : '-- Sin tickets disponibles --';
      select.appendChild(placeholder);

      ticketOptions.forEach(function(ticket) {
        const option = document.createElement('option');
        option.value = ticket.id;
        option.textContent = ticket.name + ' · vendidos ' + Number(ticket.quantitySold || 0) + '/' + Number(ticket.quantity || 0) + (ticket.isActive ? '' : ' · archivado');
        if (selectedId && selectedId === ticket.id) {
          option.selected = true;
        }
        select.appendChild(option);
      });
    }

    function renderAudience(audience) {
      currentAudience = audience || null;
      const rows = document.getElementById('audienceRows');
      const meta = document.getElementById('audienceMeta');

      if (!audience) {
        document.getElementById('audienceCount').textContent = '0';
        document.getElementById('standardCount').textContent = '0';
        document.getElementById('guestCount').textContent = '0';
        document.getElementById('adminCount').textContent = '0';
        document.getElementById('kRecipients').textContent = '0';
        document.getElementById('kOrders').textContent = '0';
        document.getElementById('kTickets').textContent = '0';
        document.getElementById('kSource').textContent = '-';
        meta.innerHTML = '<span class="chip muted">Sin ticket seleccionado</span>';
        rows.innerHTML = '<tr><td colspan="6"><div class="empty">Aun no hay audiencia cargada.</div></td></tr>';
        return;
      }

      document.getElementById('audienceCount').textContent = String(audience.totalRecipients || 0);
      document.getElementById('standardCount').textContent = String((audience.roleBreakdown && audience.roleBreakdown.standard) || 0);
      document.getElementById('guestCount').textContent = String((audience.roleBreakdown && audience.roleBreakdown.guest) || 0);
  document.getElementById('adminCount').textContent = String((audience.roleBreakdown && audience.roleBreakdown.admin) || 0);
      document.getElementById('kRecipients').textContent = String(audience.totalRecipients || 0);
      document.getElementById('kOrders').textContent = String(audience.totalOrders || 0);
      document.getElementById('kTickets').textContent = String(audience.totalTickets || 0);
      document.getElementById('kSource').textContent = audience.source === 'ticketing-service' ? 'Microservicio' : 'DB fallback';

      meta.innerHTML = [
        '<span class="chip warm">Ticket: ' + safeHtml(audience.ticketType.name) + '</span>',
        '<span class="chip soft">Standard: ' + safeHtml((audience.roleBreakdown && audience.roleBreakdown.standard) || 0) + '</span>',
        '<span class="chip soft">Guest: ' + safeHtml((audience.roleBreakdown && audience.roleBreakdown.guest) || 0) + '</span>',
        '<span class="chip soft">Admin: ' + safeHtml((audience.roleBreakdown && audience.roleBreakdown.admin) || 0) + '</span>',
        '<span class="chip muted">Precio: $' + Number(audience.ticketType.price || 0).toFixed(2) + '</span>',
        '<span class="chip muted">Estado: ' + (audience.ticketType.isActive ? 'activo' : 'archivado') + '</span>'
      ].join('');

      if (!Array.isArray(audience.recipients) || !audience.recipients.length) {
        rows.innerHTML = '<tr><td colspan="6"><div class="empty">No se encontraron compradores ' + safeHtml(getAudienceDescriptor()) + ' para este ticket.</div></td></tr>';
        return;
      }

      rows.innerHTML = audience.recipients.map(function(recipient) {
        return '<tr>' +
          '<td><strong>' + safeHtml(recipient.name || 'comprador') + '</strong></td>' +
          '<td>' + safeHtml(recipient.email || '-') + '</td>' +
          '<td>' + safeHtml(formatRole(recipient.accountType)) + '</td>' +
          '<td>' + safeHtml(recipient.totalOrders || 0) + '</td>' +
          '<td>' + safeHtml(recipient.totalTickets || 0) + '</td>' +
          '<td>' + safeHtml(formatDate(recipient.lastPurchaseAt)) + '</td>' +
        '</tr>';
      }).join('');
    }

    async function loadTicketOptions() {
      const currentSelected = document.getElementById('ticketTypeSelect').value || '';
      renderDeliveryPreview(null);
      setMsg('campaignMsg', 'Cargando tickets desde ticketing-service...', 'info');
      try {
        const data = await fetchJson(API + '/campaigns/tickets');
        ticketOptions = Array.isArray(data) ? data : [];
        document.getElementById('ticketsCount').textContent = String(ticketOptions.length);
        renderTicketOptions(currentSelected);

        const nextSelected = currentSelected && ticketOptions.some(function(ticket){ return ticket.id === currentSelected; })
          ? currentSelected
          : (ticketOptions[0] ? ticketOptions[0].id : '');

        document.getElementById('ticketTypeSelect').value = nextSelected;
        if (nextSelected) {
          await loadAudience(nextSelected, false);
        } else {
          renderAudience(null);
          setMsg('campaignMsg', 'No hay tickets disponibles para notificaciones.', 'info');
        }
      } catch (error) {
        renderAudience(null);
        setMsg('campaignMsg', error.message || 'No se pudieron cargar tickets.', 'err');
      }
    }

    async function loadAudience(ticketTypeId, keepMessage) {
      const resolvedId = ticketTypeId || document.getElementById('ticketTypeSelect').value;
      const includeAdmin = isAdminIncluded();
      if (!resolvedId) {
        renderAudience(null);
        renderDeliveryPreview(null);
        if (!keepMessage) {
          setMsg('campaignMsg', 'Selecciona un ticket para cargar sus compradores.', 'info');
        }
        return;
      }

      renderDeliveryPreview(null);
      setMsg('campaignMsg', 'Consultando compradores del ticket seleccionado...', 'info');
      try {
        const data = await fetchJson(API + '/campaigns/tickets/' + encodeURIComponent(resolvedId) + '/audience?includeAdmin=' + (includeAdmin ? 'true' : 'false'));
        renderAudience(data);
        if (!document.getElementById('campaignSubject').value.trim()) {
          document.getElementById('campaignSubject').value = 'Actualizacion para compradores de ' + data.ticketType.name;
        }
        if (!keepMessage) {
          setMsg('campaignMsg', data.totalRecipients ? 'Audiencia cargada correctamente.' : ('El ticket no tiene compradores ' + getAudienceDescriptor() + '.'), data.totalRecipients ? 'ok' : 'info');
        }
      } catch (error) {
        renderAudience(null);
        renderDeliveryPreview(null);
        setMsg('campaignMsg', error.message || 'No se pudo cargar la audiencia.', 'err');
      }
    }

    async function sendCampaign(simulate) {
      const ticketTypeId = document.getElementById('ticketTypeSelect').value;
      const subject = document.getElementById('campaignSubject').value.trim();
      const message = document.getElementById('campaignMessage').value.trim();
      const senderName = document.getElementById('senderName').value.trim();
      const includeAdmin = isAdminIncluded();
      const testRecipients = parseEmailInput(document.getElementById('testRecipients').value);

      if (!ticketTypeId) {
        setMsg('campaignMsg', 'Debes seleccionar un ticket.', 'err');
        return;
      }
      if (!subject) {
        setMsg('campaignMsg', 'Debes escribir un asunto.', 'err');
        return;
      }
      if (!message) {
        setMsg('campaignMsg', 'Debes escribir un mensaje personalizado.', 'err');
        return;
      }

      if (!simulate) {
        const audienceSize = currentAudience && currentAudience.totalRecipients ? currentAudience.totalRecipients : 0;
        const targetSize = testRecipients.length || audienceSize;
        const confirmationMessage = testRecipients.length
          ? 'Se enviara una prueba controlada a ' + targetSize + ' correo(s) QA. No se usara la audiencia real. Deseas continuar?'
          : 'Se enviara la notificacion a ' + targetSize + ' comprador(es). Deseas continuar?';
        const confirmed = window.confirm(confirmationMessage);
        if (!confirmed) {
          return;
        }
      }

      setCampaignButtonsDisabled(true);
      setMsg('campaignMsg', simulate ? 'Generando simulacion de envio...' : (testRecipients.length ? 'Enviando prueba controlada...' : 'Enviando notificacion personalizada...'), 'info');

      try {
        const result = await fetchJson(API + '/campaigns/tickets/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketTypeId: ticketTypeId,
            subject: subject,
            message: message,
            senderName: senderName,
            includeAdmin: includeAdmin,
            simulate: !!simulate,
            testRecipients: testRecipients,
          }),
        });
        renderDeliveryPreview(result);
        if (simulate) {
          setMsg('campaignMsg', 'Simulacion lista. Destinatarios resueltos: ' + (result.totalResolvedRecipients || 0) + '.', 'ok');
        } else {
          setMsg(
            'campaignMsg',
            (testRecipients.length ? 'Prueba controlada enviada.' : 'Notificacion enviada.') + ' Notificaciones guardadas: ' + (result.notificationsSaved || 0) + '. Correos enviados: ' + (result.emailsSent || 0) + '.',
            'ok',
          );
          document.getElementById('campaignMessage').value = '';
          await Promise.all([loadHistory(), loadAudience(ticketTypeId, true)]);
          renderDeliveryPreview(result);
        }
      } catch (error) {
        setMsg('campaignMsg', error.message || 'No se pudo enviar la notificacion.', 'err');
      } finally {
        setCampaignButtonsDisabled(false);
      }
    }

    async function loadHistory() {
      const container = document.getElementById('historyList');
      container.innerHTML = '<div class="empty">Cargando historial...</div>';
      try {
        const data = await fetchJson(API + '/data?limit=18');
        const items = Array.isArray(data) ? data : [];
        if (!items.length) {
          container.innerHTML = '<div class="empty">Todavia no hay notificaciones registradas.</div>';
          return;
        }
        container.innerHTML = items.map(function(item) {
          return '<article class="history-item">' +
            '<div>' +
              '<strong>' + safeHtml(item.message || 'Sin mensaje') + '</strong>' +
              '<small>Destino: ' + safeHtml(item.recipient || '-') + '</small>' +
            '</div>' +
            '<button class="danger" type="button" onclick="removeNotification(\'' + safeHtml(item.id || '') + '\')">Eliminar</button>' +
          '</article>';
        }).join('');
      } catch (error) {
        container.innerHTML = '<div class="empty">' + safeHtml(error.message || 'No se pudo cargar el historial.') + '</div>';
      }
    }

    async function removeNotification(id) {
      if (!id) return;
      const confirmed = window.confirm('Confirmar eliminacion de notificacion?');
      if (!confirmed) {
        return;
      }
      try {
        await fetchJson(API + '/data/' + encodeURIComponent(id), { method: 'DELETE' });
        await loadHistory();
      } catch (error) {
        window.alert(error.message || 'No se pudo eliminar la notificacion.');
      }
    }

    document.getElementById('reloadTicketsBtn').addEventListener('click', function() {
      loadTicketOptions();
    });
    document.getElementById('reloadHistoryBtn').addEventListener('click', function() {
      loadHistory();
    });
    document.getElementById('ticketTypeSelect').addEventListener('change', function(event) {
      loadAudience(event.target.value, false);
    });
    document.getElementById('includeAdminToggle').addEventListener('change', function() {
      loadAudience(document.getElementById('ticketTypeSelect').value, false);
    });
    document.getElementById('sendCampaignBtn').addEventListener('click', function() {
      sendCampaign(false);
    });
    document.getElementById('simulateCampaignBtn').addEventListener('click', function() {
      sendCampaign(true);
    });

    loadTicketOptions();
    loadHistory();
    setInterval(function() {
      if (document.visibilityState === 'visible') {
        loadHistory();
      }
    }, 20000);

    window.removeNotification = removeNotification;
  </script>
</body>
</html>`;
}