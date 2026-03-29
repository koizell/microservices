import { Body, Controller, Delete, Get, Header, Param, Post, Put, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('events')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi() {
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Gestion de eventos</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#f7f8fc;--surface:#fff;--text:#0f172a;--muted:#5b6475;--line:#dbe2ee;--brand:#1d4ed8;--brand2:#1e40af;--ok:#166534;--warn:#854d0e;--danger:#b91c1c}
    *{box-sizing:border-box}
    body{margin:0;font-family:Manrope,Segoe UI,sans-serif;background:linear-gradient(160deg,#fef3c7 0,#f7f8fc 46%,#dbeafe 100%);color:var(--text)}
    .wrap{max-width:1200px;margin:24px auto;padding:0 16px 72px}
    .grid{display:grid;grid-template-columns:1.15fr .85fr;gap:14px;margin-top:16px;align-items:start}
    .stack{display:grid;gap:14px;align-content:start;align-items:start}
    .card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 10px 22px rgba(15,23,42,.06)}
    .row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.row2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.row4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .field{display:grid;gap:6px}.field label{font-size:12px;font-weight:800;color:#475569;letter-spacing:.02em}
    input,textarea,button{min-height:42px;padding:10px 12px;border-radius:10px;border:1px solid #c7d2e5;font:inherit} textarea{min-height:110px;resize:vertical}
    input:focus,textarea:focus{outline:2px solid #93c5fd;border-color:#93c5fd}
    button{cursor:pointer;font-weight:800;border:0;background:linear-gradient(135deg,var(--brand),var(--brand2));color:#fff}
    button.ghost{background:#fff;color:#1e3a8a;border:1px solid #bfdbfe} button.danger{background:#fee2e2;color:var(--danger);border:1px solid #fecaca}
    .msg{display:none;margin-top:10px;padding:10px 12px;border-radius:10px;font-size:14px}.msg.show{display:block}.msg.ok{background:#ecfdf3;color:var(--ok);border:1px solid #bbf7d0}.msg.err{background:#fef2f2;color:var(--danger);border:1px solid #fecaca}.msg.info{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe}
    .help{font-size:13px;color:var(--muted)}
    .weekdays{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.weekday{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--line);border-radius:10px;background:#f8fafc}
    .map{border:1px solid var(--line);border-radius:14px;overflow:hidden;height:280px;background:#f8fafc}.searchRow{display:grid;grid-template-columns:1fr auto;gap:8px}.resultList{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:8px;max-height:180px;overflow:auto}.resultList li{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}.resultText{font-size:12px;color:#475569}.resultBtn{min-height:36px;padding:8px 10px;border-radius:8px;background:#1e3a8a;color:#fff;border:0;cursor:pointer}
    .toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.toggle{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
    .eventList{display:grid;gap:14px;margin-top:12px;padding-bottom:28px}.eventItem{border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}.eventSummary{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(150px,.8fr) minmax(150px,.8fr) auto;gap:10px;align-items:center;padding:14px}.eventSummaryCell{display:grid;gap:4px}.eventSummaryLabel{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em}.eventSummaryValue{font-size:14px;color:#0f172a;line-height:1.35}.eventSummaryValue.title{font-size:18px;font-weight:800}.summaryActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.eventDetails{display:none;padding:0 14px 14px;border-top:1px solid var(--line)}.eventItem.expanded .eventDetails{display:block}.detailHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;padding-top:12px}.detailStatus{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.meta div{padding:10px;border:1px solid var(--line);border-radius:10px;background:#f8fafc;font-size:13px;color:#334155}
    .pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800;text-transform:uppercase}.pill.upcoming{background:#dbeafe;color:#1d4ed8}.pill.active{background:#dcfce7;color:#166534}.pill.finished{background:#fee2e2;color:#991b1b}.pill.archived{background:#e5e7eb;color:#374151}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:0;justify-content:flex-end}.actions button{min-height:38px;padding:8px 12px}.small{font-size:12px;color:var(--muted)}
    @media(max-width:1020px){.grid{grid-template-columns:1fr}.row,.row2,.row4,.weekdays,.meta,.eventSummary{grid-template-columns:1fr}.actions,.summaryActions{justify-content:flex-start}}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="grid">
      <div class="stack">
        <section class="card">
          <div class="toolbar">
            <div>
              <h2 id="formTitle" style="margin:0">Crear evento</h2>
              <p class="help">Un admin puede definir varios dias, horarios y una descripcion mas completa del evento.</p>
            </div>
            <div class="actions">
              <button id="saveBtn" type="button">Crear evento</button>
              <button id="cancelEdit" type="button" class="ghost" style="display:none">Cancelar edicion</button>
            </div>
          </div>
          <input id="editingId" type="hidden">
          <div class="row2" style="margin-top:12px">
            <div class="field">
              <label for="title">Nombre del evento</label>
              <input id="title" placeholder="Ej. Congreso de tecnologia, Festival, Taller premium">
            </div>
            <div class="field">
              <label for="locationText">Ubicacion del evento</label>
              <input id="locationText" placeholder="Direccion, sede o referencia del evento">
            </div>
          </div>
          <div class="row4" style="margin-top:10px">
            <div class="field">
              <label for="startDate">Fecha de inicio</label>
              <input id="startDate" type="date">
            </div>
            <div class="field">
              <label for="endDate">Fecha de finalizacion</label>
              <input id="endDate" type="date">
            </div>
            <div class="field">
              <label for="startTime">Hora de inicio</label>
              <input id="startTime" type="time" value="09:00">
            </div>
            <div class="field">
              <label for="endTime">Hora de finalizacion</label>
              <input id="endTime" type="time" value="18:00">
            </div>
          </div>
          <div class="field" style="margin-top:10px">
            <label for="description">Descripcion del evento</label>
            <textarea id="description" placeholder="Describe de que trata el evento, a quien va dirigido, reglas, agenda general y cualquier detalle importante."></textarea>
          </div>
          <div class="help" style="margin-top:10px">Selecciona los dias en los que el evento estara activo dentro del rango de fechas indicado arriba.</div>
          <div class="weekdays" id="weekdayList"></div>
          <div id="formMsg" class="msg"></div>
        </section>

        <section class="card">
          <h3 style="margin:0 0 8px">Listado de eventos</h3>
          <div class="toolbar">
            <label class="toggle"><input id="showArchived" type="checkbox"> Mostrar archivados/finalizados</label>
            <button id="reload" type="button" class="ghost">Recargar</button>
          </div>
          <div id="listMsg" class="msg"></div>
          <div id="list" class="eventList"></div>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <h3 style="margin:0 0 8px">Ubicacion y mapa</h3>
          <div class="searchRow">
            <input id="searchLocation" placeholder="Buscar direccion o lugar">
            <button id="searchBtn" type="button">Buscar</button>
          </div>
          <ul id="searchResults" class="resultList"></ul>
          <p id="mapStatus" class="help"></p>
          <div class="map"><div id="map" style="width:100%;height:100%"></div></div>
          <p class="help" style="margin-top:8px">Coordenadas: <span id="locLabel">sin seleccionar</span></p>
        </section>

        <section class="card">
          <h3 style="margin:0 0 8px">Resumen</h3>
          <div class="meta" id="summaryMeta">
            <div><strong>Total</strong><br>0</div>
            <div><strong>Proximos</strong><br>0</div>
            <div><strong>Activos</strong><br>0</div>
            <div><strong>Finalizados</strong><br>0</div>
          </div>
        </section>
      </div>
    </div>
  </div>

  <script>
    const api = '/events/data';
    const summaryApi = '/events/summary';
    const GOOGLE_MAPS_KEY = '${googleMapsKey}';
    const WEEKDAYS = [
      ['monday','Lunes'],['tuesday','Martes'],['wednesday','Miercoles'],['thursday','Jueves'],['friday','Viernes'],['saturday','Sabado'],['sunday','Domingo']
    ];
    let map, marker, mapMode = 'none', selectedLocation = null, eventsCache = [];
    let summaryCache = {};
    let pendingListHint = '';
    let listHintActive = false;
    let expandedEvents = new Set();
    const defaultCenter = { lat: 19.4326, lng: -99.1332 };

    function setMsg(id, message, type) {
      const el = document.getElementById(id);
      el.className = message ? ('msg show ' + type) : 'msg';
      el.textContent = message || '';
    }

    function showListHint(message) {
      listHintActive = true;
      setMsg('listMsg', message, 'info');
    }

    function clearListHint() {
      if (!listHintActive) {
        return;
      }
      listHintActive = false;
      setMsg('listMsg', '', 'info');
    }

    function updateLabel() {
      const label = document.getElementById('locLabel');
      if (!selectedLocation) {
        label.textContent = 'sin seleccionar';
        return;
      }
      label.textContent = selectedLocation.lat.toFixed(6) + ', ' + selectedLocation.lng.toFixed(6);
    }

    function setSelected(lat, lng) {
      selectedLocation = { lat: Number(lat), lng: Number(lng) };
      updateLabel();
    }

    function placePoint(lat, lng) {
      setSelected(lat, lng);
      const pos = { lat: Number(lat), lng: Number(lng) };
      if (mapMode === 'google') {
        if (marker) {
          marker.setPosition(pos);
        } else {
          marker = new google.maps.Marker({ position: pos, map: map, draggable: true });
          marker.addListener('dragend', function(event) {
            placePoint(event.latLng.lat(), event.latLng.lng());
          });
        }
        map.panTo(pos);
        map.setZoom(16);
        return;
      }
      if (mapMode === 'leaflet') {
        if (marker) {
          marker.setLatLng([lat, lng]);
        } else {
          marker = L.marker([lat, lng], { draggable: true }).addTo(map);
          marker.on('dragend', function(ev) {
            const point = ev.target.getLatLng();
            setSelected(point.lat, point.lng);
          });
        }
        map.setView([lat, lng], 16);
      }
    }

    function initMap() {
      mapMode = 'google';
      document.getElementById('mapStatus').textContent = 'Mapa: Google Maps';
      map = new google.maps.Map(document.getElementById('map'), { center: defaultCenter, zoom: 12 });
      map.addListener('click', function(event) {
        placePoint(event.latLng.lat(), event.latLng.lng());
      });
      updateLabel();
    }
    window.initMap = initMap;

    function ensureLeafletLoaded() {
      return new Promise(function(resolve, reject) {
        if (window.L) { resolve(); return; }
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(css);
        const js = document.createElement('script');
        js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        js.onload = function() { resolve(); };
        js.onerror = function() { reject(new Error('No se pudo cargar Leaflet')); };
        document.body.appendChild(js);
      });
    }

    async function initLeafletMap() {
      await ensureLeafletLoaded();
      mapMode = 'leaflet';
      document.getElementById('mapStatus').textContent = 'Mapa: OpenStreetMap';
      map = L.map('map').setView([defaultCenter.lat, defaultCenter.lng], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      map.on('click', function(event) { placePoint(event.latlng.lat, event.latlng.lng); });
      updateLabel();
    }

    function loadGoogleOrFallback() {
      const hasRealKey = GOOGLE_MAPS_KEY && GOOGLE_MAPS_KEY !== 'YOUR_API_KEY';
      if (!hasRealKey) {
        initLeafletMap().catch(function() { document.getElementById('mapStatus').textContent = 'No se pudo cargar el mapa.'; });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GOOGLE_MAPS_KEY) + '&callback=initMap';
      script.async = true;
      script.defer = true;
      script.onerror = function() {
        initLeafletMap().catch(function() { document.getElementById('mapStatus').textContent = 'No se pudo cargar el mapa.'; });
      };
      document.body.appendChild(script);
      setTimeout(function() {
        if (mapMode === 'none') {
          initLeafletMap().catch(function() { document.getElementById('mapStatus').textContent = 'No se pudo cargar el mapa.'; });
        }
      }, 3000);
    }

    async function searchLocation() {
      const query = document.getElementById('searchLocation').value.trim();
      if (!query) return;
      document.getElementById('mapStatus').textContent = 'Buscando ubicacion...';
      const list = document.getElementById('searchResults');
      list.innerHTML = '';
      try {
        const response = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(query));
        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
          document.getElementById('mapStatus').textContent = 'No se encontraron resultados.';
          return;
        }
        data.forEach(function(item) {
          const li = document.createElement('li');
          const text = document.createElement('div');
          text.className = 'resultText';
          text.textContent = item.display_name;
          const button = document.createElement('button');
          button.className = 'resultBtn';
          button.textContent = 'Usar';
          button.onclick = function() {
            placePoint(parseFloat(item.lat), parseFloat(item.lon));
            document.getElementById('locationText').value = item.display_name;
            document.getElementById('mapStatus').textContent = 'Ubicacion seleccionada.';
          };
          li.appendChild(text);
          li.appendChild(button);
          list.appendChild(li);
        });
        document.getElementById('mapStatus').textContent = 'Selecciona un resultado para fijar el punto.';
      } catch {
        document.getElementById('mapStatus').textContent = 'Error al buscar ubicacion.';
      }
    }

    function weekdayMarkup() {
      return WEEKDAYS.map(function(entry) {
        return '<label class="weekday"><input type="checkbox" value="' + entry[0] + '" checked> ' + entry[1] + '</label>';
      }).join('');
    }

    function getSelectedWeekdays() {
      return Array.from(document.querySelectorAll('#weekdayList input:checked')).map(function(input) { return input.value; });
    }

    function getLocationValue() {
      const label = document.getElementById('locationText').value.trim();
      if (selectedLocation && label) {
        return label + ' | ' + selectedLocation.lat.toFixed(6) + ',' + selectedLocation.lng.toFixed(6);
      }
      if (selectedLocation) {
        return selectedLocation.lat.toFixed(6) + ',' + selectedLocation.lng.toFixed(6);
      }
      return label;
    }

    function resetForm() {
      document.getElementById('editingId').value = '';
      document.getElementById('formTitle').textContent = 'Crear evento';
      document.getElementById('saveBtn').textContent = 'Crear evento';
      document.getElementById('cancelEdit').style.display = 'none';
      document.getElementById('title').value = '';
      document.getElementById('locationText').value = '';
      document.getElementById('description').value = '';
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value = '';
      document.getElementById('startTime').value = '09:00';
      document.getElementById('endTime').value = '18:00';
      Array.from(document.querySelectorAll('#weekdayList input')).forEach(function(input) { input.checked = true; });
      selectedLocation = null;
      if (marker && mapMode === 'google') { marker.setMap(null); marker = null; }
      if (marker && mapMode === 'leaflet') { map.removeLayer(marker); marker = null; }
      updateLabel();
      setMsg('formMsg', '', 'info');
    }

    function fillForm(event) {
      document.getElementById('editingId').value = event.id;
      document.getElementById('formTitle').textContent = 'Editar evento';
      document.getElementById('saveBtn').textContent = 'Guardar cambios';
      document.getElementById('cancelEdit').style.display = 'inline-flex';
      document.getElementById('title').value = event.title || '';
      document.getElementById('locationText').value = (event.location || '').split('|')[0].trim();
      document.getElementById('description').value = event.description || '';
      document.getElementById('startDate').value = event.startDate || '';
      document.getElementById('endDate').value = event.endDate || event.startDate || '';
      document.getElementById('startTime').value = event.startTime || '09:00';
      document.getElementById('endTime').value = event.endTime || '18:00';
      const selected = new Set(Array.isArray(event.activeWeekdays) && event.activeWeekdays.length ? event.activeWeekdays : WEEKDAYS.map(function(entry){ return entry[0]; }));
      Array.from(document.querySelectorAll('#weekdayList input')).forEach(function(input) {
        input.checked = selected.has(input.value);
      });
      const coords = String(event.location || '').match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (coords) {
        placePoint(Number(coords[1]), Number(coords[2]));
      }
    }

    function translateStatus(event) {
      if (event.isArchived) {
        return 'Archivado';
      }
      const status = String(event.status || 'upcoming').toLowerCase();
      return {
        upcoming: 'Proximo',
        active: 'Activo',
        finished: 'Finalizado',
      }[status] || 'Proximo';
    }

    function statusPill(event) {
      const status = String(event.status || 'upcoming').toLowerCase();
      const extra = event.isArchived ? ' archived' : '';
      return '<span class="pill ' + status + extra + '">' + translateStatus(event) + '</span>';
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function toggleEventDetails(id) {
      if (expandedEvents.has(id)) {
        expandedEvents.delete(id);
      } else {
        expandedEvents.add(id);
      }
      renderEventList();
    }

    function startModifyEvent(event) {
      fillForm(event);
      const formTitle = document.getElementById('formTitle');
      if (formTitle) {
        formTitle.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function renderSummary(summary) {
      const meta = document.getElementById('summaryMeta');
      meta.innerHTML = [
        '<div><strong>Total</strong><br>' + Number(summary.total || 0) + '</div>',
        '<div><strong>Proximos</strong><br>' + Number(summary.upcoming || 0) + '</div>',
        '<div><strong>Activos</strong><br>' + Number(summary.active || 0) + '</div>',
        '<div><strong>Finalizados</strong><br>' + Number(summary.finished || 0) + '</div>',
      ].join('');
    }

    function renderEventList() {
      const list = document.getElementById('list');
      const includeArchived = document.getElementById('showArchived').checked;
      const hasHiddenFinishedEvents = !includeArchived && (Number(summaryCache.finished || 0) > 0 || Number(summaryCache.archived || 0) > 0);
      list.innerHTML = '';
      if (!eventsCache.length) {
        if (hasHiddenFinishedEvents) {
          showListHint('No hay eventos visibles con el filtro actual. Activa Mostrar archivados/finalizados para ver los eventos ya finalizados.');
          list.innerHTML = '<div class="small">No hay eventos activos para este filtro. Activa Mostrar archivados/finalizados para ver los eventos finalizados.</div>';
          return;
        }
        clearListHint();
        list.innerHTML = '<div class="small">No hay eventos registrados para este filtro.</div>';
        return;
      }

      if (pendingListHint) {
        showListHint(pendingListHint);
        pendingListHint = '';
      } else {
        clearListHint();
      }

      eventsCache.forEach(function(event) {
        const isExpanded = expandedEvents.has(event.id);
        const node = document.createElement('article');
        node.className = 'eventItem' + (isExpanded ? ' expanded' : '');
        node.innerHTML =
          '<div class="eventSummary">' +
            '<div class="eventSummaryCell">' +
              '<span class="eventSummaryLabel">Nombre del evento</span>' +
              '<span class="eventSummaryValue title">' + escapeHtml(event.title || '-') + '</span>' +
            '</div>' +
            '<div class="eventSummaryCell">' +
              '<span class="eventSummaryLabel">Fecha de inicio</span>' +
              '<span class="eventSummaryValue">' + escapeHtml(event.startDate || '-') + '</span>' +
            '</div>' +
            '<div class="eventSummaryCell">' +
              '<span class="eventSummaryLabel">Fecha de finalizacion</span>' +
              '<span class="eventSummaryValue">' + escapeHtml(event.endDate || '-') + '</span>' +
            '</div>' +
            '<div class="summaryActions">' +
              statusPill(event) +
              '<button class="ghost" type="button" data-action="toggle">Editar</button>' +
            '</div>' +
          '</div>' +
          '<div class="eventDetails">' +
            '<div class="detailHead">' +
              '<div><div class="small">' + escapeHtml(event.description || 'Sin descripcion') + '</div></div>' +
            '</div>' +
            '<div class="meta">' +
              '<div><strong>Hora de inicio</strong><br>' + escapeHtml(event.startTime || '-') + '</div>' +
              '<div><strong>Hora de finalizacion</strong><br>' + escapeHtml(event.endTime || '-') + '</div>' +
              '<div><strong>Dias activos</strong><br>' + escapeHtml(Array.isArray(event.activeWeekdays) ? event.activeWeekdays.join(', ') : '-') + '</div>' +
              '<div><strong>Ubicacion</strong><br>' + escapeHtml(event.location || '-') + '</div>' +
            '</div>' +
            '<div class="actions" style="margin-top:12px">' +
              '<button class="ghost" type="button" data-action="modify">Modificar</button>' +
              '<button class="danger" type="button" data-action="delete">Eliminar</button>' +
            '</div>' +
          '</div>';

        node.querySelector('[data-action="toggle"]').onclick = function(ev) {
          ev.stopPropagation();
          toggleEventDetails(event.id);
        };
        node.querySelector('[data-action="modify"]').onclick = function() { startModifyEvent(event); };
        node.querySelector('[data-action="delete"]').onclick = async function() {
          if (!confirm('Eliminar evento?')) return;
          const response = await fetch(api + '/' + event.id, { method: 'DELETE' });
          const payload = await response.json().catch(function(){ return {}; });
          if (!response.ok) {
            listHintActive = false;
            setMsg('listMsg', payload.message || 'No se pudo eliminar el evento', 'err');
            return;
          }
          listHintActive = false;
          setMsg('listMsg', 'Evento eliminado.', 'ok');
          if (document.getElementById('editingId').value === event.id) {
            resetForm();
          }
          expandedEvents.delete(event.id);
          await load();
        };
        node.querySelector('.eventSummary').onclick = function(ev) {
          if (ev.target.closest('button')) {
            return;
          }
          toggleEventDetails(event.id);
        };
        list.appendChild(node);
      });
    }

    async function load() {
      const includeArchived = document.getElementById('showArchived').checked;
      const [eventsResponse, summaryResponse] = await Promise.all([
        fetch(api + '?includeArchived=' + includeArchived),
        fetch(summaryApi),
      ]);
      const eventsData = await eventsResponse.json().catch(function(){ return []; });
      const summaryData = await summaryResponse.json().catch(function(){ return {}; });
      eventsCache = Array.isArray(eventsData) ? eventsData : [];
      summaryCache = summaryData && typeof summaryData === 'object' ? summaryData : {};
      expandedEvents = new Set(Array.from(expandedEvents).filter(function(id) {
        return eventsCache.some(function(event) { return event.id === id; });
      }));
      renderSummary(summaryCache);
      renderEventList();
    }

    async function saveEvent() {
      const body = {
        title: document.getElementById('title').value.trim(),
        description: document.getElementById('description').value.trim(),
        startDate: document.getElementById('startDate').value,
        endDate: document.getElementById('endDate').value,
        startTime: document.getElementById('startTime').value,
        endTime: document.getElementById('endTime').value,
        activeWeekdays: getSelectedWeekdays(),
        location: getLocationValue(),
      };
      if (!body.title || !body.startDate || !body.endDate || !body.location) {
        setMsg('formMsg', 'Completa titulo, rango de fechas y ubicacion.', 'err');
        return;
      }
      const editingId = document.getElementById('editingId').value;
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? (api + '/' + editingId) : api;

      const response = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(function(){ return {}; });
      if (!response.ok) {
        setMsg('formMsg', payload.message || 'No se pudo guardar el evento', 'err');
        return;
      }
      setMsg('formMsg', editingId ? 'Evento actualizado.' : 'Evento creado.', 'ok');
      pendingListHint = '';
      if (payload.status === 'finished' || payload.isArchived) {
        document.getElementById('showArchived').checked = true;
        pendingListHint = 'Se activo Mostrar archivados/finalizados porque, con la fecha u hora elegida, este evento ya aparece como finalizado.';
      }
      resetForm();
      await load();
    }

    document.getElementById('weekdayList').innerHTML = weekdayMarkup();
    document.getElementById('searchBtn').onclick = searchLocation;
    document.getElementById('saveBtn').onclick = saveEvent;
    document.getElementById('cancelEdit').onclick = resetForm;
    document.getElementById('reload').onclick = load;
    document.getElementById('showArchived').addEventListener('change', load);
    document.getElementById('searchLocation').addEventListener('keydown', function(event) {
      if (event.key === 'Enter') { event.preventDefault(); searchLocation(); }
    });
    load();
    setInterval(function() { if (document.visibilityState === 'visible') { load(); } }, 15000);
    document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') { load(); } });
    loadGoogleOrFallback();
  </script>
</body>
</html>`;
  }

  @Get('data')
  async findAll(@Query('limit') limit?: string, @Query('includeArchived') includeArchived?: string) {
    const withArchived = ['true', '1', 'yes'].includes(String(includeArchived ?? '').toLowerCase());
    return await this.appService.findAll(Number(limit ?? 50), withArchived);
  }

  @Get('data/:id')
  async findOne(@Param('id') id: string) {
    return await this.appService.findOne(id);
  }

  @Get('summary')
  async summary() {
    return await this.appService.getSummary();
  }

  @Post('data')
  async create(
    @Body()
    event: {
      title: string;
      startDate: string;
      endDate: string;
      startTime?: string;
      endTime?: string;
      description?: string;
      location: string;
      activeWeekdays?: string[];
    },
  ) {
    return await this.appService.create(event);
  }

  @Put('data/:id')
  async update(
    @Param('id') id: string,
    @Body()
    event: {
      title?: string;
      startDate?: string;
      endDate?: string;
      startTime?: string;
      endTime?: string;
      description?: string;
      location?: string;
      activeWeekdays?: string[];
    },
  ) {
    return await this.appService.update(id, event);
  }

  @Delete('data/:id')
  async remove(@Param('id') id: string) {
    return await this.appService.remove(id);
  }
}
