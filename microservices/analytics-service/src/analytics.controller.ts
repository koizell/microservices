import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi() {
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Analitica de ventas</title>
  <style>
    :root{--bg:#f8fafc;--ink:#111827;--card:#fff;--line:#e2e8f0;--brand:#1d4ed8}
    *{box-sizing:border-box}
    body{margin:0;font-family:Manrope,ui-sans-serif,sans-serif;background:linear-gradient(160deg,#fef3c7 0,#f7f8fc 46%,#dbeafe 100%);color:var(--ink)}
    .wrap{max-width:1080px;margin:20px auto;padding:0 14px}
    .head{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}
    .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:14px;box-shadow:0 10px 22px rgba(15,23,42,.06)}
    .row{display:grid;grid-template-columns:1fr 1fr 1fr 1.2fr auto auto;gap:8px}
    input,select,button{min-height:42px;padding:10px 12px;border-radius:10px;border:1px solid #c7d2e5}
    input:focus,select:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
    button{font-weight:700;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease}
    button:hover{transform:translateY(-1px)}
    button.primary{background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#fff;border:0;box-shadow:0 8px 18px rgba(29,78,216,.22)}
    button.ghost{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe}
    .kpi{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .tile{padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}
    .tile b{font-size:24px}
    .muted{color:#5b6475;font-size:13px}
    .bar{height:8px;background:#ede9fe;border-radius:999px;overflow:hidden}
    .bar span{display:block;height:100%;background:#7c3aed}
    .toggle{display:flex;align-items:center;gap:8px;font-size:13px;color:#334155;font-weight:600}
    @media(max-width:1024px){.row{grid-template-columns:1fr 1fr 1fr}}
    @media(max-width:680px){.row{grid-template-columns:1fr}.kpi{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="head">
      <div>
        <h1 style="margin:0">Analitica de ventas</h1>
        <p class="muted" style="margin:4px 0 0">Informacion financiera de ventas de tickets.</p>
      </div>
      <button id="reload" class="ghost">Recargar</button>
    </div>
    <section class="card">
      <h3>Filtros de busqueda</h3>
      <div class="row">
        <input id="filterFrom" type="date" placeholder="Desde">
        <input id="filterTo" type="date" placeholder="Hasta">
        <input id="filterMin" type="number" min="0" step="0.01" placeholder="Ingreso minimo">
        <select id="filterTicket"><option value="">Todos los tickets</option></select>
        <button id="applyFilters" class="primary">Aplicar</button>
        <button id="clearFilters" class="ghost">Limpiar</button>
      </div>
      <div class="row" style="margin-top:8px">
        <label class="toggle"><input id="filterActiveOnly" type="checkbox" checked> Solo tickets activos</label>
        <div class="muted" id="filterLabel"></div>
      </div>
    </section>
    <section class="card">
      <div class="kpi">
        <div class="tile"><span id="revTodayLabel">Ingresos hoy</span><br><b id="revToday">$0.00</b><div class="muted" id="revTodayMeta">Actual</div></div>
        <div class="tile">Ingresos en periodo<br><b id="revPeriod">$0.00</b></div>
      </div>
      <h3 style="margin-top:14px">Ultimas ventas</h3>
      <div id="history"></div>
    </section>
  </div>
  <script>
    let dailyRows = [];
    let historyRows = [];
    let ticketTypes = [];

    function fmtMoney(value) {
      return '$' + Number(value || 0).toFixed(2);
    }

    function todayIso() {
      return new Date().toISOString().slice(0, 10);
    }

    function isLocalHost() {
      const host = window.location.hostname || 'localhost';
      return host === 'localhost' || host === '127.0.0.1';
    }

    function gatewayBase() {
      const host = window.location.hostname || 'localhost';
      const port = window.location.port || '';
      if (isLocalHost() && port && port !== '3008') {
        return 'http://' + host + ':3008';
      }
      return window.location.origin;
    }

    function ticketBase() {
      return gatewayBase() + '/tickets';
    }

    function selectedTicket() {
      return document.getElementById('filterTicket').value || '';
    }

    function normalizeHistoryRow(row) {
      const createdAt = String(row.createdAt || '');
      const day = String(row.day || (createdAt ? createdAt.slice(0, 10) : ''));
      const time = createdAt.length >= 16 ? createdAt.slice(11, 16) : '';
      return {
        id: String(row.id || ''),
        createdAt: createdAt,
        day: day,
        createdAtLabel: time ? day + ' ' + time : day,
        ticketTypeName: String(row.ticketTypeName || 'Ticket'),
        totalRevenue: Number(row.totalRevenue || 0),
        totalTickets: Number(row.totalTickets || 0),
        status: String(row.status || 'paid'),
      };
    }

    function updateFilterLabel() {
      const label = document.getElementById('filterLabel');
      const parts = [];
      const from = document.getElementById('filterFrom').value;
      const to = document.getElementById('filterTo').value;
      const min = Number(document.getElementById('filterMin').value || 0);

      if (from) { parts.push('desde ' + from); }
      if (to) { parts.push('hasta ' + to); }
      if (min > 0) { parts.push('minimo ' + fmtMoney(min)); }

      const ticketId = selectedTicket();
      if (ticketId) {
        const match = ticketTypes.find(function (ticket) { return String(ticket.id) === ticketId; });
        parts.push('ticket ' + (match ? match.name : ticketId));
      }

      label.textContent = parts.length ? 'Filtro: ' + parts.join(' | ') : 'Sin filtros aplicados';
    }

    function applyFilters() {
      const from = document.getElementById('filterFrom').value;
      const to = document.getElementById('filterTo').value;
      const min = Number(document.getElementById('filterMin').value || 0);
      let rows = historyRows.slice();

      if (from) {
        rows = rows.filter(function (row) { return row.day >= from; });
      }
      if (to) {
        rows = rows.filter(function (row) { return row.day <= to; });
      }
      if (min > 0) {
        rows = rows.filter(function (row) { return Number(row.totalRevenue || 0) >= min; });
      }

      renderRows(rows);
      updatePrimaryKpi();
      updateFilterLabel();
    }

    function renderRows(rows) {
      const history = document.getElementById('history');
      history.innerHTML = '';
      const total = rows.reduce(function (acc, item) { return acc + Number(item.totalRevenue || 0); }, 0);
      document.getElementById('revPeriod').textContent = fmtMoney(total);

      if (rows.length === 0) {
        history.innerHTML = '<div class="muted">Sin ventas en el periodo seleccionado.</div>';
        return;
      }

      const max = Math.max.apply(null, rows.map(function (item) { return Number(item.totalRevenue || 0); }).concat([1]));
      rows.forEach(function (item) {
        const pct = Math.max(3, Math.round((Number(item.totalRevenue || 0) * 100) / max));
        const ticketCount = Number(item.totalTickets || 0);
        const quantityLabel = ticketCount === 1 ? '1 ticket' : ticketCount + ' tickets';
        const row = document.createElement('div');
        row.style.margin = '8px 0';
        row.innerHTML = '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><strong>' + item.ticketTypeName + '</strong><div class="muted">' + item.createdAtLabel + ' | ' + quantityLabel + ' | ' + item.status + '</div></div><div style="text-align:right"><strong>' + fmtMoney(item.totalRevenue || 0) + '</strong></div></div>' +
          '<div class="bar"><span style="width:' + pct + '%"></span></div>';
        history.appendChild(row);
      });
    }

    function updatePrimaryKpi() {
      const label = document.getElementById('revTodayLabel');
      const value = document.getElementById('revToday');
      const meta = document.getElementById('revTodayMeta');
      const ticketId = selectedTicket();

      if (ticketId) {
        label.textContent = 'Ultimo dia con ventas';
        if (dailyRows.length > 0) {
          value.textContent = fmtMoney(dailyRows[0].totalRevenue);
          meta.textContent = dailyRows[0].day;
        } else {
          value.textContent = fmtMoney(0);
          meta.textContent = 'Sin ventas registradas';
        }
        return;
      }

      const today = dailyRows.find(function (row) { return row.day === todayIso(); });
      label.textContent = 'Ingresos hoy';
      value.textContent = fmtMoney(today ? today.totalRevenue : 0);
      meta.textContent = today ? today.day : 'Actual';
    }

    async function loadData() {
      const params = new URLSearchParams();
      params.set('limit', '90');
      const ticketId = selectedTicket();
      if (ticketId) {
        params.set('ticketTypeId', ticketId);
      }
      try {
        const responses = await Promise.all([
          fetch('/analytics/data?' + params.toString()),
          fetch('/analytics/history?' + params.toString()),
        ]);
        const dailyData = await responses[0].json();
        const salesData = await responses[1].json();
        dailyRows = Array.isArray(dailyData) ? dailyData : [];
        historyRows = Array.isArray(salesData) ? salesData.map(normalizeHistoryRow) : [];
        applyFilters();
      } catch (error) {
        dailyRows = [];
        historyRows = [];
        applyFilters();
        const label = document.getElementById('filterLabel');
        label.textContent = 'No se pudo cargar el historial de ventas';
      }
    }

    function renderTicketOptions() {
      const select = document.getElementById('filterTicket');
      const activeOnly = document.getElementById('filterActiveOnly').checked;
      const selected = select.value;
      select.innerHTML = '<option value="">Todos los tickets</option>';
      ticketTypes.filter(function (ticket) {
        return !activeOnly || ticket.isActive !== false;
      }).forEach(function (ticket) {
        const option = document.createElement('option');
        option.value = String(ticket.id);
        option.textContent = (ticket.name || 'Ticket') + (ticket.isActive === false ? ' (inactivo)' : '');
        select.appendChild(option);
      });
      if (selected) {
        select.value = selected;
      }
      return select.value;
    }

    async function loadTicketTypes() {
      try {
        const response = await fetch(ticketBase() + '/types?includeInactive=true');
        if (!response.ok) {
          throw new Error('No se pudo cargar tickets');
        }
        const data = await response.json();
        ticketTypes = Array.isArray(data) ? data : [];
        renderTicketOptions();
      } catch (error) {
        ticketTypes = [];
        renderTicketOptions();
        const label = document.getElementById('filterLabel');
        label.textContent = 'No se pudieron cargar tickets activos';
      }
    }

    document.getElementById('applyFilters').onclick = loadData;
    document.getElementById('clearFilters').onclick = function () {
      document.getElementById('filterFrom').value = '';
      document.getElementById('filterTo').value = '';
      document.getElementById('filterMin').value = '';
      document.getElementById('filterTicket').value = '';
      loadData();
    };
    document.getElementById('reload').onclick = loadData;
    document.getElementById('filterTicket').addEventListener('change', loadData);
    document.getElementById('filterActiveOnly').addEventListener('change', function () {
      renderTicketOptions();
      loadData();
    });

    loadTicketTypes().finally(loadData);
    setInterval(function () {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    }, 15000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    });
  </script>
</body>
</html>`;
  }

  @Get('health')
  status() {
    return { service: 'analytics-service', status: 'ok' };
  }

  @Post('ingest/ticket-purchased')
  async ingest(@Body() body: { amount: number; quantity?: number }) {
    return await this.analyticsService.recordTicketPurchase(body);
  }

  @Get('summary')
  async summary() {
    return await this.analyticsService.getSummary();
  }

  @Get('data')
  async listDailySales(@Query('limit') limit?: string, @Query('ticketTypeId') ticketTypeId?: string) {
    return await this.analyticsService.listDailySales({
      limit: Number(limit ?? 30),
      ticketTypeId,
    });
  }

  @Get('history')
  async listSalesHistory(@Query('limit') limit?: string, @Query('ticketTypeId') ticketTypeId?: string) {
    return await this.analyticsService.listSalesHistory({
      limit: Number(limit ?? 30),
      ticketTypeId,
    });
  }
}
