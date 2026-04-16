import { Body, Controller, Delete, Get, Header, Headers, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('events')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  status() {
    return { service: 'event-service', status: 'ok' };
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  renderUi(@Query('mode') mode?: string) {
    const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY ?? '';
    const isReadOnlyView = ['viewer', 'participant', 'read-only'].includes(String(mode ?? '').trim().toLowerCase());
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
    .map{border:1px solid var(--line);border-radius:14px;overflow:hidden;height:280px;background:#f8fafc}.searchRow{display:grid;grid-template-columns:1fr auto;gap:8px}.searchActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.resultList{list-style:none;padding:0;margin:8px 0 0;display:grid;gap:8px;max-height:220px;overflow:auto}.resultList li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}.resultText{display:grid;gap:4px}.resultLabel{font-size:13px;font-weight:800;color:#0f172a;line-height:1.4}.resultMeta{font-size:11px;color:#64748b;line-height:1.4}.resultBtn{min-height:36px;padding:8px 10px;border-radius:8px;background:#1e3a8a;color:#fff;border:0;cursor:pointer}.selectedLocation{display:grid;gap:4px;margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#eff6ff}.selectedLocation.empty{background:#fff;border-style:dashed}.selectedLocation strong{font-size:13px}.selectedLocation span{font-size:12px;color:#475569;line-height:1.4}
    .toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}.toggle{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
    .eventList{display:grid;gap:14px;margin-top:12px;padding-bottom:28px}.eventItem{border:1px solid var(--line);border-radius:14px;background:#fff;overflow:hidden}.eventSummary{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(150px,.8fr) minmax(150px,.8fr) auto;gap:10px;align-items:center;padding:14px}.eventSummaryCell{display:grid;gap:4px}.eventSummaryLabel{font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.04em}.eventSummaryValue{font-size:14px;color:#0f172a;line-height:1.35}.eventSummaryValue.title{font-size:18px;font-weight:800}.summaryActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.eventDetails{display:none;padding:0 14px 14px;border-top:1px solid var(--line)}.eventItem.expanded .eventDetails{display:block}.detailHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;padding-top:12px}.detailStatus{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.meta div{padding:10px;border:1px solid var(--line);border-radius:10px;background:#f8fafc;font-size:13px;color:#334155}
    .pill{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800;text-transform:uppercase}.pill.upcoming{background:#dbeafe;color:#1d4ed8}.pill.active{background:#dcfce7;color:#166534}.pill.finished{background:#fee2e2;color:#991b1b}.pill.archived{background:#e5e7eb;color:#374151}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:0;justify-content:flex-end}.actions button{min-height:38px;padding:8px 12px}.small{font-size:12px;color:var(--muted)}
    .read-only .creation-only{display:none}
    @media(max-width:1020px){.grid{grid-template-columns:1fr}.row,.row2,.row4,.weekdays,.meta,.eventSummary{grid-template-columns:1fr}.actions,.summaryActions{justify-content:flex-start}}
  </style>
</head>
<body class="${isReadOnlyView ? 'read-only' : ''}">
  <div class="wrap">
    <div class="grid">
      <div class="stack">
        <section class="card creation-only">
          <div class="toolbar">
            <div>
              <h2 id="formTitle" style="margin:0">Crear evento</h2>
              <p class="help">Un organizador puede definir varios dias, horarios y una descripcion mas completa del evento.</p>
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
        <section class="card creation-only">
          <h3 style="margin:0 0 8px">Ubicacion y mapa</h3>
          <p class="help" style="margin:0 0 10px">Escribe la direccion final en Ubicacion del evento. Aqui puedes buscar sugerencias, usar la direccion manualmente o fijar un punto exacto en el mapa.</p>
          <div class="searchRow">
            <input id="searchLocation" placeholder="Ej. Diagonal 12 #7-75, Barrio La Granja, Monteria, Cordoba">
            <button id="searchBtn" type="button">Buscar</button>
          </div>
          <div class="searchActions">
            <button id="useManualLocationBtn" type="button" class="ghost">Usar direccion escrita</button>
            <button id="clearLocationBtn" type="button" class="ghost">Limpiar ubicacion</button>
          </div>
          <ul id="searchResults" class="resultList"></ul>
          <p id="mapStatus" class="help"></p>
          <div class="map"><div id="map" style="width:100%;height:100%"></div></div>
          <div id="selectedLocationCard" class="selectedLocation empty">
            <strong id="selectedLocationTitle">Sin ubicacion confirmada</strong>
            <span id="selectedLocationAddress">Escribe una direccion, busca sugerencias o haz clic en el mapa.</span>
            <span id="selectedLocationMeta">Todavia no hay coordenadas asociadas.</span>
          </div>
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
    const isReadOnlyView = ${isReadOnlyView ? 'true' : 'false'};
    const storageKeys = {
      token: 'eventhive.session.token',
    };
    const WEEKDAYS = [
      ['monday','Lunes'],['tuesday','Martes'],['wednesday','Miercoles'],['thursday','Jueves'],['friday','Viernes'],['saturday','Sabado'],['sunday','Domingo']
    ];
    let map, marker, mapMode = 'none', selectedLocation = null, eventsCache = [];
    let googleGeocoder = null;
    let googleAutocompleteReady = false;
    let googleAutocompleteInstances = [];
    let locationLookupToken = 0;
    let summaryCache = {};
    let pendingListHint = '';
    let listHintActive = false;
    let expandedEvents = new Set();
    const defaultCenter = { lat: 4.5709, lng: -74.2973 };
    let regionBias = {
      center: { lat: defaultCenter.lat, lng: defaultCenter.lng },
      bounds: null,
      countryCode: '',
      label: '',
      source: 'predeterminado',
    };
    const REGION_FALLBACKS = {
      co: { center: { lat: 4.5709, lng: -74.2973 }, label: 'Colombia', zoom: 7 },
      mx: { center: { lat: 23.6345, lng: -102.5528 }, label: 'Mexico', zoom: 6 },
      ar: { center: { lat: -38.4161, lng: -63.6167 }, label: 'Argentina', zoom: 5 },
      es: { center: { lat: 40.4168, lng: -3.7038 }, label: 'Espana', zoom: 6 },
      us: { center: { lat: 39.8283, lng: -98.5795 }, label: 'Estados Unidos', zoom: 4 },
    };

    function setMsg(id, message, type) {
      const el = document.getElementById(id);
      el.className = message ? ('msg show ' + type) : 'msg';
      el.textContent = message || '';
    }

    function getSessionToken() {
      try {
        return String(localStorage.getItem(storageKeys.token) || '').trim();
      } catch {
        return '';
      }
    }

    function authHeaders(extraHeaders) {
      const headers = { ...(extraHeaders || {}) };
      const token = getSessionToken();
      if (token) {
        headers.Authorization = 'Bearer ' + token;
      }
      return headers;
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

    function normalizeText(value) {
      return String(value || '').trim();
    }

    function setMapStatus(message) {
      document.getElementById('mapStatus').textContent = message || '';
    }

    function clearSearchResults() {
      document.getElementById('searchResults').innerHTML = '';
    }

    function inferCountryCodeFromLocale() {
      if (typeof navigator === 'undefined') {
        return '';
      }
      const locale = normalizeText((navigator.languages && navigator.languages[0]) || navigator.language || '');
      const match = locale.match(/[-_]([a-z]{2})$/i);
      return match ? match[1].toLowerCase() : '';
    }

    function inferCountryCodeFromQuery(query) {
      const normalized = normalizeText(query).toLowerCase();
      const knownCountries = [
        ['colombia', 'co'],
        ['mexico', 'mx'],
        ['mexico d.f.', 'mx'],
        ['espana', 'es'],
        ['españa', 'es'],
        ['argentina', 'ar'],
        ['peru', 'pe'],
        ['perú', 'pe'],
        ['chile', 'cl'],
        ['ecuador', 'ec'],
        ['venezuela', 've'],
        ['estados unidos', 'us'],
        ['united states', 'us'],
        ['usa', 'us'],
      ];

      for (let index = 0; index < knownCountries.length; index += 1) {
        if (normalized.indexOf(knownCountries[index][0]) >= 0) {
          return knownCountries[index][1];
        }
      }

      return '';
    }

    function buildBoundsAround(center, accuracyMeters) {
      const safeAccuracy = Math.max(8000, Math.min(150000, Number(accuracyMeters) || 50000));
      const latSpan = Math.max(0.12, Math.min(1.35, safeAccuracy / 111000));
      const lngSpanBase = safeAccuracy / (111000 * Math.max(0.3, Math.cos((center.lat * Math.PI) / 180)));
      const lngSpan = Math.max(0.12, Math.min(1.35, lngSpanBase));
      return {
        west: center.lng - lngSpan,
        south: center.lat - latSpan,
        east: center.lng + lngSpan,
        north: center.lat + latSpan,
      };
    }

    function getRegionBoundsLiteral() {
      if (!regionBias.bounds) {
        return null;
      }

      return {
        north: regionBias.bounds.north,
        south: regionBias.bounds.south,
        east: regionBias.bounds.east,
        west: regionBias.bounds.west,
      };
    }

    function getRegionContextText() {
      if (regionBias.source === 'ubicacion actual') {
        return ' Priorizando tu region actual.';
      }
      if (regionBias.label) {
        return ' Priorizando ' + regionBias.label + '.';
      }
      return '';
    }

    function applyGoogleAutocompleteBias() {
      const bounds = getRegionBoundsLiteral();
      if (!bounds || !googleAutocompleteInstances.length) {
        return;
      }

      googleAutocompleteInstances.forEach(function(autocomplete) {
        if (autocomplete && typeof autocomplete.setBounds === 'function') {
          autocomplete.setBounds(bounds);
        }
      });
    }

    function recenterMapToRegionBias(zoom) {
      if (!map || selectedLocation || !regionBias.center) {
        return;
      }

      if (mapMode === 'google') {
        map.setCenter(regionBias.center);
        if (zoom) {
          map.setZoom(zoom);
        }
        return;
      }

      if (mapMode === 'leaflet') {
        map.setView([regionBias.center.lat, regionBias.center.lng], zoom || map.getZoom() || 12);
      }
    }

    function setRegionBias(lat, lng, options) {
      const center = { lat: Number(lat), lng: Number(lng) };
      const nextCountryCode = normalizeText(options && options.countryCode).toLowerCase();
      regionBias = {
        center: center,
        bounds: buildBoundsAround(center, options && options.accuracy),
        countryCode: nextCountryCode || regionBias.countryCode,
        label: normalizeText(options && options.label),
        source: normalizeText(options && options.source) || 'sesgo regional',
      };
      applyGoogleAutocompleteBias();
      recenterMapToRegionBias(options && options.zoom ? options.zoom : 13);
    }

    function initializeRegionBiasFromLocale() {
      const localeCountryCode = inferCountryCodeFromLocale();
      if (localeCountryCode) {
        regionBias.countryCode = localeCountryCode;
      }

      const fallback = localeCountryCode && REGION_FALLBACKS[localeCountryCode] ? REGION_FALLBACKS[localeCountryCode] : null;
      if (!fallback) {
        return;
      }

      setRegionBias(fallback.center.lat, fallback.center.lng, {
        countryCode: localeCountryCode,
        label: fallback.label,
        source: 'navegador',
        accuracy: 120000,
        zoom: fallback.zoom,
      });
    }

    function detectPreferredRegion() {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        return;
      }

      navigator.geolocation.getCurrentPosition(
        function(position) {
          setRegionBias(position.coords.latitude, position.coords.longitude, {
            countryCode: inferCountryCodeFromLocale() || regionBias.countryCode,
            label: 'tu region actual',
            source: 'ubicacion actual',
            accuracy: position.coords.accuracy || 20000,
            zoom: 14,
          });
          setMapStatus('Region detectada desde tu ubicacion actual. La busqueda ahora prioriza esa zona.');
        },
        function() {
          if (regionBias.label) {
            setMapStatus('No se pudo usar tu ubicacion actual. Se priorizara ' + regionBias.label + ' segun tu navegador.');
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 4500,
          maximumAge: 300000,
        },
      );
    }

    function extractStoredLocationLabel(value) {
      const raw = normalizeText(value);
      if (!raw) {
        return '';
      }
      if (raw.indexOf('|') >= 0) {
        return normalizeText(raw.split('|')[0]);
      }
      return /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(raw) ? '' : raw;
    }

    function renderSelectedLocation() {
      const card = document.getElementById('selectedLocationCard');
      const title = document.getElementById('selectedLocationTitle');
      const address = document.getElementById('selectedLocationAddress');
      const meta = document.getElementById('selectedLocationMeta');
      const manualLabel = normalizeText(document.getElementById('locationText').value);
      const bestLabel = manualLabel || (selectedLocation && normalizeText(selectedLocation.label)) || '';

      if (!selectedLocation && !bestLabel) {
        card.className = 'selectedLocation empty';
        title.textContent = 'Sin ubicacion confirmada';
        address.textContent = 'Escribe una direccion, busca sugerencias o haz clic en el mapa.';
        meta.textContent = 'Todavia no hay coordenadas asociadas.';
        return;
      }

      card.className = 'selectedLocation';
      if (!selectedLocation) {
        title.textContent = 'Direccion manual lista';
        address.textContent = bestLabel;
        meta.textContent = 'Se guardara solo el texto. Usa Buscar o el mapa si tambien quieres coordenadas exactas.';
        return;
      }

      title.textContent = selectedLocation.source
        ? ('Ubicacion confirmada (' + selectedLocation.source + ')')
        : 'Ubicacion confirmada';
      address.textContent = bestLabel || 'Punto seleccionado en el mapa';
      meta.textContent = 'Coordenadas: ' + selectedLocation.lat.toFixed(6) + ', ' + selectedLocation.lng.toFixed(6);
    }

    function updateLabel() {
      const label = document.getElementById('locLabel');
      if (!selectedLocation) {
        label.textContent = 'sin seleccionar';
        renderSelectedLocation();
        return;
      }
      label.textContent = selectedLocation.lat.toFixed(6) + ', ' + selectedLocation.lng.toFixed(6);
      renderSelectedLocation();
    }

    function setSelected(lat, lng, details) {
      const next = {
        lat: Number(lat),
        lng: Number(lng),
        label: selectedLocation && selectedLocation.label ? selectedLocation.label : '',
        source: selectedLocation && selectedLocation.source ? selectedLocation.source : '',
      };

      if (details && Object.prototype.hasOwnProperty.call(details, 'label')) {
        next.label = normalizeText(details.label);
      } else if (!next.label) {
        next.label = normalizeText(document.getElementById('locationText').value);
      }

      if (details && Object.prototype.hasOwnProperty.call(details, 'source')) {
        next.source = normalizeText(details.source);
      }

      selectedLocation = next;
      updateLabel();
    }

    function placePoint(lat, lng, details) {
      setSelected(lat, lng, details);
      const pos = { lat: Number(lat), lng: Number(lng) };
      if (mapMode === 'google') {
        if (marker) {
          marker.setPosition(pos);
        } else {
          marker = new google.maps.Marker({ position: pos, map: map, draggable: true });
          marker.addListener('dragend', function(event) {
            handleMapSelection(event.latLng.lat(), event.latLng.lng());
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
            handleMapSelection(point.lat, point.lng);
          });
        }
        map.setView([lat, lng], 16);
      }
    }

    function applyResolvedLocation(lat, lng, details) {
      const label = normalizeText(details && details.label);
      const source = normalizeText(details && details.source) || 'busqueda';
      locationLookupToken += 1;
      if (label) {
        document.getElementById('locationText').value = label;
        document.getElementById('searchLocation').value = label;
      }
      placePoint(lat, lng, { label: label, source: source });
      clearSearchResults();
      setMapStatus((details && details.statusMessage) || 'Ubicacion seleccionada y lista para guardar.');
    }

    async function reverseGeocode(lat, lng) {
      if (window.google && google.maps && google.maps.Geocoder) {
        if (!googleGeocoder) {
          googleGeocoder = new google.maps.Geocoder();
        }
        return await new Promise(function(resolve, reject) {
          googleGeocoder.geocode({ location: { lat: Number(lat), lng: Number(lng) } }, function(results, status) {
            if (status === 'OK' || status === google.maps.GeocoderStatus.OK) {
              resolve(results && results[0] ? results[0].formatted_address : '');
              return;
            }
            if (status === 'ZERO_RESULTS' || status === google.maps.GeocoderStatus.ZERO_RESULTS) {
              resolve('');
              return;
            }
            reject(new Error(status || 'geocoder_error'));
          });
        });
      }

      const response = await fetch(
        'https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=es&zoom=18&lat=' +
          encodeURIComponent(String(lat)) +
          '&lon=' +
          encodeURIComponent(String(lng)),
      );
      const data = await response.json().catch(function() { return {}; });
      return normalizeText(data.display_name);
    }

    async function handleMapSelection(lat, lng) {
      const lookupId = ++locationLookupToken;
      const previousLabel = normalizeText(document.getElementById('locationText').value);
      placePoint(lat, lng, { label: '', source: 'mapa' });
      clearSearchResults();
      setMapStatus('Buscando una direccion aproximada para el punto seleccionado...');

      try {
        const resolvedLabel = await reverseGeocode(lat, lng);
        if (lookupId !== locationLookupToken) {
          return;
        }

        if (resolvedLabel) {
          document.getElementById('locationText').value = resolvedLabel;
          document.getElementById('searchLocation').value = resolvedLabel;
          placePoint(lat, lng, { label: resolvedLabel, source: 'mapa' });
          setMapStatus('Ubicacion seleccionada y mostrada en el formulario.');
          return;
        }

        if (previousLabel) {
          document.getElementById('locationText').value = previousLabel;
          placePoint(lat, lng, { label: previousLabel, source: 'mapa' });
          setMapStatus('Punto actualizado. Conservamos la direccion escrita mientras ajustas el lugar exacto.');
          return;
        }

        setMapStatus('Punto seleccionado. Escribe una direccion manual o usa Buscar para verla con mas detalle.');
        renderSelectedLocation();
      } catch {
        if (lookupId !== locationLookupToken) {
          return;
        }

        if (previousLabel) {
          document.getElementById('locationText').value = previousLabel;
          placePoint(lat, lng, { label: previousLabel, source: 'mapa' });
          setMapStatus('Punto actualizado. No pudimos resolver la direccion exacta, pero conservamos el texto que escribiste.');
          return;
        }

        setMapStatus('Punto seleccionado. No pudimos resolver una direccion exacta en este momento.');
        renderSelectedLocation();
      }
    }

    function bindGoogleAutocomplete(inputId) {
      if (!(window.google && google.maps && google.maps.places)) {
        return;
      }

      const input = document.getElementById(inputId);
      const autocomplete = new google.maps.places.Autocomplete(input, {
        fields: ['formatted_address', 'geometry', 'name'],
        strictBounds: false,
      });
      googleAutocompleteInstances.push(autocomplete);
      applyGoogleAutocompleteBias();

      autocomplete.addListener('place_changed', function() {
        const place = autocomplete.getPlace();
        if (!place || !place.geometry || !place.geometry.location) {
          setMapStatus('Google Maps no pudo resolver ese lugar. Intenta elegir una sugerencia mas especifica.');
          return;
        }

        applyResolvedLocation(place.geometry.location.lat(), place.geometry.location.lng(), {
          label: place.formatted_address || place.name || input.value,
          source: 'Google Places',
          statusMessage: 'Ubicacion seleccionada desde Google Places.',
        });
      });
    }

    function initGoogleAutocomplete() {
      if (googleAutocompleteReady || !(window.google && google.maps && google.maps.places)) {
        return;
      }

      bindGoogleAutocomplete('searchLocation');
      bindGoogleAutocomplete('locationText');
      googleAutocompleteReady = true;
    }

    async function searchWithGoogle(query) {
      if (!(window.google && google.maps && google.maps.Geocoder)) {
        return [];
      }

      if (!googleGeocoder) {
        googleGeocoder = new google.maps.Geocoder();
      }

      const regionBounds = getRegionBoundsLiteral();
      const countryCode = inferCountryCodeFromQuery(query) || regionBias.countryCode;
      const request = { address: query };
      if (regionBounds) {
        request.bounds = regionBounds;
      }
      if (countryCode) {
        request.region = countryCode;
      }

      const response = await new Promise(function(resolve, reject) {
        googleGeocoder.geocode(request, function(results, status) {
          if (status === 'OK' || status === google.maps.GeocoderStatus.OK) {
            resolve(Array.isArray(results) ? results : []);
            return;
          }
          if (status === 'ZERO_RESULTS' || status === google.maps.GeocoderStatus.ZERO_RESULTS) {
            resolve([]);
            return;
          }
          reject(new Error(status || 'geocoder_error'));
        });
      });

      return response.slice(0, 8).map(function(result) {
        return {
          label: result.formatted_address || query,
          lat: result.geometry.location.lat(),
          lng: result.geometry.location.lng(),
          source: 'Google Maps',
          meta: (Array.isArray(result.types) && result.types.length ? result.types.join(', ') + ' | ' : '') +
            'Coordenadas: ' + result.geometry.location.lat().toFixed(6) + ', ' + result.geometry.location.lng().toFixed(6),
        };
      });
    }

    async function searchWithNominatim(query) {
      const params = new URLSearchParams({
        format: 'jsonv2',
        addressdetails: '1',
        limit: '8',
        dedupe: '1',
        'accept-language': 'es',
        q: query,
      });
      const regionBounds = getRegionBoundsLiteral();
      const countryCode = inferCountryCodeFromQuery(query) || regionBias.countryCode;
      if (countryCode) {
        params.set('countrycodes', countryCode);
      }
      if (regionBounds) {
        params.set('viewbox', regionBounds.west + ',' + regionBounds.north + ',' + regionBounds.east + ',' + regionBounds.south);
      }
      const response = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString());
      const data = await response.json().catch(function() { return []; });
      if (!Array.isArray(data)) {
        return [];
      }

      return data.map(function(item) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        return {
          label: item.display_name,
          lat: lat,
          lng: lng,
          source: 'OpenStreetMap',
          meta: (item.type ? 'Tipo: ' + item.type + ' | ' : '') + 'Coordenadas: ' + lat.toFixed(6) + ', ' + lng.toFixed(6),
        };
      }).filter(function(item) {
        return Number.isFinite(item.lat) && Number.isFinite(item.lng);
      });
    }

    function renderSearchResults(results) {
      const list = document.getElementById('searchResults');
      list.innerHTML = '';

      results.forEach(function(item) {
        const li = document.createElement('li');
        const text = document.createElement('div');
        text.className = 'resultText';

        const title = document.createElement('span');
        title.className = 'resultLabel';
        title.textContent = item.label;

        const meta = document.createElement('span');
        meta.className = 'resultMeta';
        meta.textContent = (item.source || 'Busqueda') + ' | ' + (item.meta || '');

        const button = document.createElement('button');
        button.className = 'resultBtn';
        button.textContent = 'Usar';
        button.onclick = function() {
          applyResolvedLocation(item.lat, item.lng, {
            label: item.label,
            source: item.source,
            statusMessage: 'Ubicacion seleccionada desde ' + (item.source || 'la busqueda') + '.',
          });
        };

        text.appendChild(title);
        text.appendChild(meta);
        li.appendChild(text);
        li.appendChild(button);
        list.appendChild(li);
      });
    }

    function useManualLocation() {
      const manual = normalizeText(document.getElementById('locationText').value) || normalizeText(document.getElementById('searchLocation').value);
      if (!manual) {
        setMapStatus('Escribe una direccion en Ubicacion del evento o en Buscar direccion o lugar.');
        return;
      }

      locationLookupToken += 1;
      document.getElementById('locationText').value = manual;
      document.getElementById('searchLocation').value = manual;
      clearSearchResults();

      if (selectedLocation) {
        placePoint(selectedLocation.lat, selectedLocation.lng, {
          label: manual,
          source: selectedLocation.source || 'manual',
        });
        setMapStatus('Direccion manual actualizada. Conservamos el punto que ya habias marcado.');
        return;
      }

      renderSelectedLocation();
      setMapStatus('Direccion manual lista. Usa Buscar o el mapa si tambien quieres coordenadas exactas.');
    }

    function clearLocationSelection(options) {
      const config = options || {};
      locationLookupToken += 1;
      if (config.clearText !== false) {
        document.getElementById('locationText').value = '';
        document.getElementById('searchLocation').value = '';
      }
      clearSearchResults();
      selectedLocation = null;
      if (marker && mapMode === 'google') {
        marker.setMap(null);
        marker = null;
      }
      if (marker && mapMode === 'leaflet' && map) {
        map.removeLayer(marker);
        marker = null;
      }
      updateLabel();
      if (config.announce !== false) {
        setMapStatus('Ubicacion limpiada.');
      }
    }

    function initMap() {
      mapMode = 'google';
      setMapStatus('Mapa: Google Maps listo. Puedes usar autocompletado, buscar o hacer clic en el mapa.' + getRegionContextText());
      map = new google.maps.Map(document.getElementById('map'), { center: regionBias.center || defaultCenter, zoom: regionBias.source === 'ubicacion actual' ? 14 : 12 });
      map.addListener('click', function(event) {
        handleMapSelection(event.latLng.lat(), event.latLng.lng());
      });
      initGoogleAutocomplete();
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
      setMapStatus('Mapa: OpenStreetMap listo. Busca una direccion, usa el texto manual o haz clic en el mapa.' + getRegionContextText());
      map = L.map('map').setView([regionBias.center.lat, regionBias.center.lng], regionBias.source === 'ubicacion actual' ? 14 : 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      map.on('click', function(event) { handleMapSelection(event.latlng.lat, event.latlng.lng); });
      updateLabel();
    }

    function loadGoogleOrFallback() {
      const hasRealKey = GOOGLE_MAPS_KEY && GOOGLE_MAPS_KEY !== 'YOUR_API_KEY';
      if (!hasRealKey) {
        initLeafletMap().catch(function() { setMapStatus('No se pudo cargar el mapa.'); });
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(GOOGLE_MAPS_KEY) + '&libraries=places&callback=initMap';
      script.async = true;
      script.defer = true;
      script.onerror = function() {
        initLeafletMap().catch(function() { setMapStatus('No se pudo cargar el mapa.'); });
      };
      document.body.appendChild(script);
      setTimeout(function() {
        if (mapMode === 'none') {
          initLeafletMap().catch(function() { setMapStatus('No se pudo cargar el mapa.'); });
        }
      }, 3000);
    }

    async function searchLocation() {
      const query = normalizeText(document.getElementById('searchLocation').value) || normalizeText(document.getElementById('locationText').value);
      if (!query) {
        setMapStatus('Escribe una direccion o un lugar para buscar.');
        return;
      }

      document.getElementById('searchLocation').value = query;
      clearSearchResults();
      setMapStatus('Buscando ubicacion...');
      try {
        let results = [];
        try {
          results = await searchWithGoogle(query);
        } catch {
          results = [];
        }
        if (!results.length) {
          results = await searchWithNominatim(query);
        }
        if (!results.length) {
          setMapStatus('No se encontraron resultados. Puedes guardar la direccion manualmente o ajustar el texto.');
          renderSelectedLocation();
          return;
        }
        renderSearchResults(results);
        setMapStatus('Selecciona un resultado para fijar el punto exacto.');
      } catch {
        setMapStatus('Error al buscar ubicacion.');
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

    function syncDateRangeConstraints(forceAlign) {
      const startInput = document.getElementById('startDate');
      const endInput = document.getElementById('endDate');
      const startValue = startInput.value;
      const endValue = endInput.value;

      endInput.min = startValue || '';
      if (!startValue) {
        return false;
      }

      if (forceAlign || !endValue || endValue < startValue) {
        endInput.value = startValue;
        return Boolean(endValue) && endValue < startValue;
      }

      return false;
    }

    function translateEventFormError(message) {
      const normalized = String(message || '').trim();
      if (!normalized) {
        return 'No se pudo guardar el evento';
      }

      const translations = {
        'endDate cannot be earlier than startDate': 'La fecha de finalizacion no puede ser anterior a la fecha de inicio.',
        'endTime must be later than startTime for single-day events': 'Para eventos del mismo dia, la hora de finalizacion debe ser posterior a la hora de inicio.',
      };

      return translations[normalized] || normalized;
    }

    function resetForm() {
      if (isReadOnlyView) {
        return;
      }
      document.getElementById('editingId').value = '';
      document.getElementById('formTitle').textContent = 'Crear evento';
      document.getElementById('saveBtn').textContent = 'Crear evento';
      document.getElementById('cancelEdit').style.display = 'none';
      document.getElementById('title').value = '';
      document.getElementById('description').value = '';
      document.getElementById('startDate').value = '';
      document.getElementById('endDate').value = '';
      document.getElementById('startTime').value = '09:00';
      document.getElementById('endTime').value = '18:00';
      Array.from(document.querySelectorAll('#weekdayList input')).forEach(function(input) { input.checked = true; });
      clearLocationSelection({ announce: false });
      setMapStatus('');
      syncDateRangeConstraints(false);
      setMsg('formMsg', '', 'info');
    }

    function fillForm(event) {
      clearLocationSelection({ clearText: false, announce: false });
      document.getElementById('editingId').value = event.id;
      document.getElementById('formTitle').textContent = 'Editar evento';
      document.getElementById('saveBtn').textContent = 'Guardar cambios';
      document.getElementById('cancelEdit').style.display = 'inline-flex';
      document.getElementById('title').value = event.title || '';
      const storedLabel = extractStoredLocationLabel(event.location || '');
      document.getElementById('locationText').value = storedLabel;
      document.getElementById('searchLocation').value = storedLabel;
      document.getElementById('description').value = event.description || '';
      document.getElementById('startDate').value = event.startDate || '';
      document.getElementById('endDate').value = event.endDate || event.startDate || '';
      document.getElementById('startTime').value = event.startTime || '09:00';
      document.getElementById('endTime').value = event.endTime || '18:00';
      syncDateRangeConstraints(false);
      const selected = new Set(Array.isArray(event.activeWeekdays) && event.activeWeekdays.length ? event.activeWeekdays : WEEKDAYS.map(function(entry){ return entry[0]; }));
      Array.from(document.querySelectorAll('#weekdayList input')).forEach(function(input) {
        input.checked = selected.has(input.value);
      });
      const coords = String(event.location || '').match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (coords) {
        placePoint(Number(coords[1]), Number(coords[2]), { label: storedLabel, source: 'evento guardado' });
        setMapStatus('Ubicacion recuperada desde el evento guardado.');
        return;
      }
      updateLabel();
      setMapStatus(storedLabel ? 'Direccion manual recuperada. Usa Buscar o el mapa si quieres fijar coordenadas.' : '');
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
      if (isReadOnlyView) {
        return;
      }
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
      const toggleLabel = isReadOnlyView ? 'Ver detalles' : 'Editar';
      const hasHiddenFinishedEvents = !includeArchived && (Number(summaryCache.finished || 0) > 0 || Number(summaryCache.archived || 0) > 0);
      list.innerHTML = '';
      if (!eventsCache.length) {
        if (hasHiddenFinishedEvents) {
          showListHint('No hay eventos visibles con el filtro actual. Activa Mostrar archivados/finalizados para ver los eventos ya finalizados.');
          list.innerHTML = '<div class="small">No hay eventos activos para este filtro. Activa Mostrar archivados/finalizados para ver los eventos finalizados.</div>';
          return;
        }
        clearListHint();
        list.innerHTML = isReadOnlyView
          ? '<div class="small">No hay eventos disponibles para los tickets que ya compraste.</div>'
          : '<div class="small">No hay eventos registrados para este filtro.</div>';
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
        const detailActions = isReadOnlyView
          ? ''
          : '<div class="actions" style="margin-top:12px">' +
              '<button class="ghost" type="button" data-action="modify">Modificar</button>' +
              '<button class="danger" type="button" data-action="delete">Eliminar</button>' +
            '</div>';
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
              '<button class="ghost" type="button" data-action="toggle">' + toggleLabel + '</button>' +
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
            detailActions +
          '</div>';

        node.querySelector('[data-action="toggle"]').onclick = function(ev) {
          ev.stopPropagation();
          toggleEventDetails(event.id);
        };
        const modifyButton = node.querySelector('[data-action="modify"]');
        if (modifyButton) {
          modifyButton.onclick = function() { startModifyEvent(event); };
        }
        const deleteButton = node.querySelector('[data-action="delete"]');
        if (deleteButton) {
          deleteButton.onclick = async function() {
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
        }
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
        fetch(api + '?includeArchived=' + includeArchived, { headers: authHeaders() }),
        fetch(summaryApi, { headers: authHeaders() }),
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
      if (isReadOnlyView) {
        setMsg('listMsg', 'Solo los organizadores pueden crear o modificar eventos.', 'info');
        return;
      }
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
      if (body.endDate < body.startDate) {
        setMsg('formMsg', 'La fecha de finalizacion no puede ser anterior a la fecha de inicio.', 'err');
        return;
      }
      if (body.startDate === body.endDate && body.endTime <= body.startTime) {
        setMsg('formMsg', 'Para eventos del mismo dia, la hora de finalizacion debe ser posterior a la hora de inicio.', 'err');
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
        setMsg('formMsg', translateEventFormError(payload.message), 'err');
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
    document.getElementById('useManualLocationBtn').onclick = useManualLocation;
    document.getElementById('clearLocationBtn').onclick = function() { clearLocationSelection(); };
    document.getElementById('saveBtn').onclick = saveEvent;
    document.getElementById('cancelEdit').onclick = resetForm;
    document.getElementById('reload').onclick = load;
    document.getElementById('locationText').addEventListener('input', function() {
      renderSelectedLocation();
    });
    document.getElementById('startDate').addEventListener('change', function() {
      const adjusted = syncDateRangeConstraints(false);
      if (adjusted) {
        setMsg('formMsg', 'La fecha de finalizacion se ajusto automaticamente para que no quede antes de la fecha de inicio.', 'info');
      }
    });
    document.getElementById('endDate').addEventListener('change', function() {
      const adjusted = syncDateRangeConstraints(false);
      if (adjusted) {
        setMsg('formMsg', 'La fecha de finalizacion no puede ser anterior a la fecha de inicio. La ajustamos automaticamente.', 'info');
      }
    });
    document.getElementById('showArchived').addEventListener('change', load);
    document.getElementById('searchLocation').addEventListener('keydown', function(event) {
      if (event.key === 'Enter') { event.preventDefault(); searchLocation(); }
    });
    if (isReadOnlyView) {
      setMsg('listMsg', 'Vista de solo lectura para participantes. Solo los organizadores pueden crear o editar eventos.', 'info');
    }
    load();
    setInterval(function() { if (document.visibilityState === 'visible') { load(); } }, 15000);
    document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') { load(); } });
    if (!isReadOnlyView) {
      initializeRegionBiasFromLocale();
      detectPreferredRegion();
      loadGoogleOrFallback();
    }
  </script>
</body>
</html>`;
  }

  @Get('data')
  async findAll(
    @Query('limit') limit?: string,
    @Query('includeArchived') includeArchived?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const withArchived = ['true', '1', 'yes'].includes(String(includeArchived ?? '').toLowerCase());
    return await this.appService.findAll(Number(limit ?? 50), withArchived, authorization);
  }

  @Get('data/:id')
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.appService.findOne(id);
  }

  @Get('summary')
  async summary(@Headers('authorization') authorization?: string) {
    return await this.appService.getSummary(authorization);
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
    @Param('id', new ParseUUIDPipe()) id: string,
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
  async remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return await this.appService.remove(id);
  }
}
