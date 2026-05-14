let sessionToken = "";
let refreshToken = "";
let currentUser = null;
let sessionTimer = null;
let refreshInFlight = null;

const hostName = window.location.hostname || "localhost";
// The frontend shell proxies API prefixes locally and in deployed environments.
const useSameOriginProxy = true;
const storageKeys = {
  token: "eventhive.session.token",
  refreshToken: "eventhive.session.refreshToken",
  user: "eventhive.session.user",
  expiresAt: "eventhive.session.expiresAt",
  lastPanel: "eventhive.session.lastPanel",
};

const servicePorts = {
  user: 3000,
  event: 3001,
  ticketing: 3002,
  notification: 3003,
  credential: 3004,
  agenda: 3005,
  analytics: 3006,
  mobile: 3007,
  gateway: 3008,
};

const servicePaths = {
  user: "/users",
  event: "/events",
  ticketing: "/tickets",
  notification: "/notifications",
  credential: "/credentials",
  agenda: "/agenda",
  analytics: "/analytics",
  mobile: "/mobile",
  gateway: "/gateway",
};

const agendaMonthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const agendaWeekdayShort = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const agendaWeekdayLong = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const agendaDayLookaheadDays = 120;
const agendaState = {
  initialized: false,
  loading: false,
  view: "month",
  filter: "all",
  referenceDate: "",
  selectedDate: "",
  items: [],
  totals: { pending: 0, active: 0, past: 0, visible: 0, occurrences: 0 },
};

const notificationsState = {
  initialized: false,
  loading: false,
  ticketTypes: [],
  audience: null,
};

const wakeState = {
  inFlight: null,
  lastSuccessAt: 0,
};

const eyeOpen = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const eyeOff = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

function isRemoteDeployment() {
  return !["localhost", "127.0.0.1", "::1"].includes(hostName);
}

function delay(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function serviceFetchWithTimeout(serviceKey, path, init, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(function () {
    controller.abort();
  }, timeoutMs);

  return serviceFetch(serviceKey, path, {
    ...(init || {}),
    signal: controller.signal,
  }).finally(function () {
    clearTimeout(timeoutId);
  });
}

function setWakeButtonState(isLoading) {
  const button = document.getElementById("wakeServicesBtn");
  if (!button) {
    return;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? "Despertando servicios..." : "Despertar servicios";
}

async function wakeRenderServices(options) {
  const settings = options || {};
  const silent = Boolean(settings.silent);

  if (!isRemoteDeployment()) {
    return { ok: true, skipped: true };
  }

  if (wakeState.inFlight) {
    return wakeState.inFlight;
  }

  if (Date.now() - wakeState.lastSuccessAt < 90000) {
    return { ok: true, cached: true };
  }

  if (!silent) {
    setAlert("alertLogin", "Despertando servicios en Render. La primera respuesta puede tardar unos segundos.", "info");
  }

  setWakeButtonState(true);

  wakeState.inFlight = (async function () {
    const checks = [
      { serviceKey: "gateway", path: "/health" },
      { serviceKey: "user", path: "/health" },
      { serviceKey: "event", path: "/health" },
      { serviceKey: "ticketing", path: "/health" },
      { serviceKey: "notification", path: "/health" },
      { serviceKey: "credential", path: "/health" },
      { serviceKey: "agenda", path: "/health" },
      { serviceKey: "analytics", path: "/health" },
      { serviceKey: "mobile", path: "/health" },
    ];

    async function pingOnce(check) {
      try {
        const response = await serviceFetchWithTimeout(check.serviceKey, check.path, { method: "GET" }, 55000);
        return response.ok;
      } catch {
        return false;
      }
    }

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const results = await Promise.all(checks.map(pingOnce));
      const okCount = results.filter(Boolean).length;

      if (okCount === checks.length) {
        wakeState.lastSuccessAt = Date.now();
        if (!silent) {
          setAlert("alertLogin", "Servicios activos. Ya puedes iniciar sesion.", "info");
        }
        return { ok: true };
      }

      if (attempt < 4) {
        await delay(5000);
      }
    }

    if (!silent) {
      setAlert("alertLogin", "Render sigue dormido o tardando en responder. Espera unos segundos y vuelve a intentarlo.", "err");
    }

    return { ok: false };
  })().finally(function () {
    setWakeButtonState(false);
    wakeState.inFlight = null;
  });

  return wakeState.inFlight;
}

function serviceBase(serviceKey) {
  if (!Object.prototype.hasOwnProperty.call(servicePaths, serviceKey)) {
    throw new Error("Servicio no soportado");
  }

  if (!useSameOriginProxy) {
    return "http://" + hostName + ":" + servicePorts[serviceKey] + servicePaths[serviceKey];
  }

  return servicePaths[serviceKey];
}

function serviceUrl(serviceKey, path) {
  const base = serviceBase(serviceKey).replace(/\/+$/, "");
  if (!path) {
    return base;
  }

  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  return base + normalizedPath;
}

function serviceFetch(serviceKey, path, init) {
  const requestInit = { ...(init || {}) };
  const headers = { ...((requestInit && requestInit.headers) || {}) };
  const body = requestInit.body;

  if (body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof URLSearchParams) && !ArrayBuffer.isView(body)) {
    requestInit.body = JSON.stringify(body);
    if (!headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  requestInit.headers = headers;
  return fetch(serviceUrl(serviceKey, path), requestInit);
}

async function readResponsePayload(response) {
  const rawText = await response.text();

  if (!rawText) {
    return { data: {}, rawText: "" };
  }

  try {
    return { data: JSON.parse(rawText), rawText: rawText };
  } catch {
    return { data: {}, rawText: rawText };
  }
}

function clearSessionStorage() {
  localStorage.removeItem(storageKeys.token);
  localStorage.removeItem(storageKeys.refreshToken);
  localStorage.removeItem(storageKeys.user);
  localStorage.removeItem(storageKeys.expiresAt);
  localStorage.removeItem(storageKeys.lastPanel);
}

function stopSessionWatcher() {
  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }
}

function decodeJwtPayload(rawToken) {
  try {
    const payload = rawToken.split(".")[1];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

function getTokenExpiry(rawToken) {
  const payload = decodeJwtPayload(rawToken);
  return Number(payload && payload.exp ? payload.exp * 1000 : 0);
}

function normalizeSessionUser(candidateUser, rawToken, fallbackEmail) {
  const payload = decodeJwtPayload(rawToken || "");
  const source = candidateUser && typeof candidateUser === "object" ? candidateUser : {};
  const resolvedEmail = String(source.email || (payload && payload.email) || fallbackEmail || "").trim().toLowerCase();

  if (!resolvedEmail) {
    return null;
  }

  return {
    id: String(source.id || (payload && payload.sub) || "").trim(),
    name: String(source.name || (payload && payload.name) || "").trim(),
    email: resolvedEmail,
    accountType: normalizeRole(source.accountType || (payload && payload.accountType) || "guest"),
    isEmailVerified: Boolean(source.isEmailVerified),
    emailVerifiedAt: source.emailVerifiedAt || null,
    avatarUrl: source.avatarUrl || null,
  };
}

function saveSessionState(lastPanelName) {
  if (!sessionToken || !currentUser || !currentUser.email) {
    return;
  }

  const expiresAt = getTokenExpiry(sessionToken) || Date.now() + 55 * 60 * 1000;
  localStorage.setItem(storageKeys.token, sessionToken);
  localStorage.setItem(storageKeys.refreshToken, refreshToken || "");
  localStorage.setItem(storageKeys.user, JSON.stringify(currentUser));
  localStorage.setItem(storageKeys.expiresAt, String(expiresAt));
  localStorage.setItem(storageKeys.lastPanel, lastPanelName || "inicio");
}

function normalizeRole(role) {
  const normalized = String(role || "guest").trim().toLowerCase();
  if (normalized === "standar") {
    return "standard";
  }
  if (normalized === "invitado") {
    return "guest";
  }
  return normalized;
}

function roleLabel(role) {
  const normalized = normalizeRole(role);
  if (normalized === "admin") {
    return "Organizador";
  }
  if (normalized === "standard") {
    return "Participante";
  }
  return "Invitado";
}

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function setAlert(id, message, type) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  element.textContent = message;
  element.className = "alert" + (message ? " show " + type : "");
}

function setAlertWithAction(id, message, type, actionUrl, actionLabel) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  element.textContent = message;

  if (actionUrl && actionLabel) {
    const link = document.createElement("a");
    link.href = actionUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "alert-action";
    link.textContent = actionLabel;
    element.appendChild(document.createElement("br"));
    element.appendChild(link);
  }

  element.className = "alert" + (message ? " show " + type : "");
}

function showView(id) {
  document.querySelectorAll(".view").forEach(function (view) {
    view.classList.remove("active");
  });

  const view = document.getElementById(id);
  if (view) {
    view.classList.add("active");
  }

  ["alertLogin", "alertReg", "alertForgot", "alertReset"].forEach(function (alertId) {
    setAlert(alertId, "", "");
  });
}

function togglePw(inputId, buttonId) {
  const input = document.getElementById(inputId);
  const button = document.getElementById(buttonId);
  if (!input || !button) {
    return;
  }

  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  button.innerHTML = visible ? eyeOpen : eyeOff;
}

function replySessionToTarget(targetWindow) {
  if (!targetWindow || !sessionToken) {
    return;
  }

  try {
    targetWindow.postMessage({
      type: "eventhive:session",
      token: sessionToken,
      refreshToken: refreshToken,
      user: currentUser,
    }, "*");
  } catch {
    return;
  }
}

function pushSessionToEmbeddedServices() {
  if (!sessionToken) {
    return;
  }

  [document.getElementById("ticketingFrame"), document.getElementById("eventFrame"), document.getElementById("credentialFrame")].forEach(function (frame) {
    if (!frame || !frame.contentWindow) {
      return;
    }

    replySessionToTarget(frame.contentWindow);
  });
}

async function refreshSession(preferredPanelName) {
  if (!refreshToken) {
    throw new Error("No hay refresh token disponible");
  }

  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async function () {
    const response = await serviceFetch("user", "/auth/refresh", {
      method: "POST",
      body: { refreshToken: refreshToken },
    });
    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok || !data.accessToken) {
      throw new Error(data.message || "No se pudo renovar la sesion");
    }

    sessionToken = data.accessToken;
    if (data.refreshToken) {
      refreshToken = data.refreshToken;
    }

    saveSessionState(preferredPanelName || localStorage.getItem(storageKeys.lastPanel) || "inicio");
    pushSessionToEmbeddedServices();
    return sessionToken;
  })().finally(function () {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function startSessionWatcher() {
  stopSessionWatcher();
  sessionTimer = setInterval(async function () {
    if (!sessionToken) {
      return;
    }

    const expiresAt = Number(localStorage.getItem(storageKeys.expiresAt) || "0");
    if (!expiresAt) {
      return;
    }

    if (Date.now() >= expiresAt - 60000) {
      try {
        await refreshSession(localStorage.getItem(storageKeys.lastPanel) || "inicio");
      } catch {
        doLogout("expired");
      }
    }
  }, 30000);
}

function isPanelAllowed(panelName, role) {
  const normalizedRole = normalizeRole(role);
  if (!panelName) {
    return false;
  }
  if ((panelName === "admin" || panelName === "analytica") && normalizedRole !== "admin") {
    return false;
  }
  if (["tickets", "credencial", "agenda", "notificaciones"].includes(panelName) && normalizedRole === "guest") {
    return false;
  }
  return Boolean(document.getElementById("panel-" + panelName));
}

function tabIdForPanel(panelName) {
  const tabMap = {
    inicio: "tabInicio",
    eventos: "tabEventos",
    tickets: "tabTickets",
    credencial: "tabCredencial",
    agenda: "tabAgenda",
    notificaciones: "tabNotifs",
    analytica: "tabAnalytica",
    admin: "tabAdmin",
    perfil: "tabPerfil",
  };
  return tabMap[panelName] || "tabInicio";
}

function applyRoleInterface(role) {
  const effectiveRole = normalizeRole(role || "guest");
  document.querySelectorAll("[data-roles]").forEach(function (node) {
    const roles = (node.getAttribute("data-roles") || "").split(",").map(function (item) {
      return item.trim();
    });
    node.style.display = roles.includes(effectiveRole) ? "" : "none";
  });

  function resolveRoleDisplay(node, fallbackDisplay) {
    if (node.dataset.roleDisplay) {
      return node.dataset.roleDisplay;
    }
    let display = fallbackDisplay;
    if (node.classList.contains("grid-cards")) {
      display = "grid";
    } else if (node.classList.contains("panel-card")) {
      display = "flex";
    }
    node.dataset.roleDisplay = display;
    return display;
  }

  function toggleRoleNodes(selector, enabled, fallbackDisplay) {
    document.querySelectorAll(selector).forEach(function (node) {
      const display = resolveRoleDisplay(node, fallbackDisplay);
      node.style.display = enabled ? display : "none";
    });
  }

  toggleRoleNodes(".admin-only", effectiveRole === "admin", "block");
  toggleRoleNodes(".buyer-only", effectiveRole === "standard", "block");
  toggleRoleNodes(".standard-only", effectiveRole === "standard" || effectiveRole === "admin", "block");
  toggleRoleNodes(".guest-only", effectiveRole === "guest", "block");

  const panelAdmin = document.getElementById("panel-admin");
  const panelAnalytica = document.getElementById("panel-analytica");
  if (effectiveRole !== "admin" && ((panelAdmin && panelAdmin.classList.contains("active")) || (panelAnalytica && panelAnalytica.classList.contains("active")))) {
    switchPanel("inicio", document.getElementById("tabInicio"));
  }
}

function ensureEmbeddedService(frameId, serviceKey, path) {
  const frame = document.getElementById(frameId);
  if (!frame) {
    return;
  }

  const targetUrl = serviceUrl(serviceKey, path || "");
  if (frame.dataset.loadedUrl === targetUrl) {
    if (sessionToken) {
      replySessionToTarget(frame.contentWindow);
    }
    return;
  }

  frame.src = targetUrl;
  frame.dataset.loadedUrl = targetUrl;
  frame.onload = function () {
    if (sessionToken) {
      replySessionToTarget(frame.contentWindow);
    }
  };
}

function switchPanel(name, tabButton) {
  document.querySelectorAll(".panel").forEach(function (panel) {
    panel.classList.remove("active");
  });
  document.querySelectorAll(".top-nav button").forEach(function (button) {
    button.classList.remove("active");
  });
  // Quitar active del botón de perfil si no es el panel activo
  const perfilBtn = document.getElementById("tabPerfil");
  if (perfilBtn && name !== "perfil") perfilBtn.classList.remove("active");

  const appMain = document.getElementById("appMain");
  if (appMain) {
    appMain.classList.toggle("service-mode", name === "tickets" || name === "eventos" || name === "credencial" || name === "analytica");
  }

  const panel = document.getElementById("panel-" + name);
  if (panel) {
    panel.classList.add("active");
  }
  if (tabButton) {
    tabButton.classList.add("active");
  }

  if (name === "tickets") {
    const effectiveRole = normalizeRole((currentUser && currentUser.accountType) || "guest");
    const ticketPath = effectiveRole === "admin" ? "/organizer" : "/client";
    const ticketFrame = document.getElementById("ticketingFrame");
    // Forzar recarga si la URL cargada no coincide con el rol actual
    if (ticketFrame) {
      const expectedUrl = (ticketPath.startsWith("/") ? ticketPath : "/" + ticketPath);
      const loadedUrl = String(ticketFrame.dataset.loadedUrl || "");
      if (!loadedUrl.endsWith(expectedUrl)) {
        ticketFrame.dataset.loadedUrl = "";
      }
    }
    ensureEmbeddedService("ticketingFrame", "ticketing", ticketPath);
  }

  if (name === "eventos") {
    const effectiveRole = normalizeRole((currentUser && currentUser.accountType) || "guest");
    ensureEmbeddedService("eventFrame", "event", effectiveRole === "admin" ? "" : "?mode=viewer");
  }

  if (name === "credencial") {
    const effectiveRole = normalizeRole((currentUser && currentUser.accountType) || "guest");
    const targetPath = effectiveRole === "admin" ? "/staff" : "/client";
    const label = document.getElementById("credentialEmbedLabel");
    if (label) {
      label.textContent = effectiveRole === "admin"
        ? "Credential Service staff cargado dentro del panel principal."
        : "Credential Service cliente cargado dentro del panel principal.";
    }
    ensureEmbeddedService("credentialFrame", "credential", targetPath);
  }

  if (name === "analytica") {
    ensureEmbeddedService("analyticsFrame", "analytics", "");
  }

  if (name === "agenda") {
    loadAgendaPanel();
  }

  if (name === "notificaciones") {
    loadNotificationsPanel();
  }

  if (name === "perfil") {
    loadProfilePanel();
  }

  if (sessionToken && currentUser && panel) {
    localStorage.setItem(storageKeys.lastPanel, name);
  }
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function agendaTodayString() {
  return agendaFormatDate(new Date());
}

function agendaFormatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function agendaParseDate(value) {
  const text = String(value || agendaTodayString()).slice(0, 10);
  const parts = text.split("-").map(function (part) {
    return Number(part);
  });
  return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
}

function agendaAddDays(value, amount) {
  const date = agendaParseDate(value);
  date.setDate(date.getDate() + amount);
  return agendaFormatDate(date);
}

function agendaStartOfWeek(value) {
  const date = agendaParseDate(value);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return agendaFormatDate(date);
}

function agendaEndOfWeek(value) {
  return agendaAddDays(agendaStartOfWeek(value), 6);
}

function agendaStartOfMonth(value) {
  const date = agendaParseDate(value);
  date.setDate(1);
  return agendaFormatDate(date);
}

function agendaEndOfMonth(value) {
  const date = agendaParseDate(value);
  date.setMonth(date.getMonth() + 1, 0);
  return agendaFormatDate(date);
}

function agendaIsSameDate(left, right) {
  return agendaFormatDate(agendaParseDate(left)) === agendaFormatDate(agendaParseDate(right));
}

function agendaHumanDate(value, options) {
  return new Intl.DateTimeFormat("es-MX", options || { day: "numeric", month: "long" }).format(agendaParseDate(value));
}

function agendaCurrentRole() {
  return normalizeRole((currentUser && currentUser.accountType) || "guest");
}

function agendaRoleText(role) {
  if (role === "admin") {
    return "Vista organizador";
  }
  if (role === "standard") {
    return "Vista participante";
  }
  return "Vista invitado";
}

function agendaStatusText(status) {
  if (status === "active") {
    return "En curso";
  }
  if (status === "past") {
    return "Pasado";
  }
  return "Pendiente";
}

function agendaRangeForState() {
  const reference = agendaState.referenceDate || agendaTodayString();
  const referenceDate = agendaParseDate(reference);

  if (agendaState.view === "month") {
    const monthStart = agendaStartOfMonth(reference);
    const monthEnd = agendaEndOfMonth(reference);
    return {
      start: agendaStartOfWeek(monthStart),
      end: agendaEndOfWeek(monthEnd),
      label: agendaMonthNames[referenceDate.getMonth()] + " " + referenceDate.getFullYear(),
      referenceMonth: referenceDate.getMonth(),
      referenceYear: referenceDate.getFullYear(),
    };
  }

  if (agendaState.view === "week") {
    const start = agendaStartOfWeek(reference);
    const end = agendaEndOfWeek(reference);
    return {
      start: start,
      end: end,
      label: agendaHumanDate(start, { day: "numeric", month: "long" }) + " - " + agendaHumanDate(end, { day: "numeric", month: "long" }),
      referenceMonth: referenceDate.getMonth(),
      referenceYear: referenceDate.getFullYear(),
    };
  }

  if (agendaState.view === "day") {
    return {
      start: reference,
      end: reference,
      label: agendaHumanDate(reference, { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
      referenceMonth: referenceDate.getMonth(),
      referenceYear: referenceDate.getFullYear(),
    };
  }

  const listStart = agendaStartOfWeek(reference);
  const listEnd = agendaAddDays(listStart, 20);
  return {
    start: listStart,
    end: listEnd,
    label: "Agenda del " + agendaHumanDate(listStart, { day: "numeric", month: "short" }) + " al " + agendaHumanDate(listEnd, { day: "numeric", month: "short" }),
    referenceMonth: referenceDate.getMonth(),
    referenceYear: referenceDate.getFullYear(),
  };
}

function agendaBuildDateRange(start, end) {
  const dates = [];
  let cursor = start;
  while (agendaParseDate(cursor) <= agendaParseDate(end)) {
    dates.push(cursor);
    cursor = agendaAddDays(cursor, 1);
  }
  return dates;
}

function agendaItemsByDate() {
  const map = {};
  agendaState.items.forEach(function (item) {
    if (!map[item.date]) {
      map[item.date] = [];
    }
    map[item.date].push(item);
  });
  return map;
}

function agendaItemsForDate(date) {
  return agendaState.items.filter(function (item) {
    return item.date === date;
  });
}

function agendaAvailableDates() {
  const seen = {};
  const dates = [];

  agendaState.items.forEach(function (item) {
    if (!item || !item.date || seen[item.date]) {
      return;
    }
    seen[item.date] = true;
    dates.push(item.date);
  });

  dates.sort();
  return dates;
}

function agendaSummaryFromItems(items) {
  const summary = {
    visible: items.length,
    pending: 0,
    active: 0,
    past: 0,
  };

  items.forEach(function (item) {
    if (item.occurrenceStatus === "past") {
      summary.past += 1;
      return;
    }
    if (item.occurrenceStatus === "active") {
      summary.active += 1;
      return;
    }
    summary.pending += 1;
  });

  return summary;
}

function agendaSummaryForCurrentView() {
  if (agendaState.view === "day" && agendaState.filter !== "past") {
    return agendaSummaryFromItems(agendaItemsForDate(agendaState.selectedDate || agendaTodayString()));
  }
  return agendaState.totals || { pending: 0, active: 0, past: 0, visible: 0 };
}

function agendaRequestRangeForState() {
  const range = agendaRangeForState();
  if (agendaState.view !== "day" || agendaState.filter === "past") {
    return { start: range.start, end: range.end };
  }

  const today = agendaTodayString();
  const reference = agendaState.referenceDate || agendaState.selectedDate || today;
  const effectiveEnd = reference > today ? reference : today;

  return {
    start: today,
    end: agendaAddDays(effectiveEnd, agendaDayLookaheadDays),
  };
}

function agendaResolveDaySelection() {
  if (agendaState.view !== "day" || agendaState.filter === "past") {
    return;
  }

  const today = agendaTodayString();
  const target = agendaState.referenceDate && agendaState.referenceDate > today ? agendaState.referenceDate : today;
  const availableDates = agendaAvailableDates().filter(function (date) {
    return date >= today;
  });
  const candidate = availableDates.find(function (date) {
    return date >= target;
  }) || availableDates[availableDates.length - 1] || target;

  agendaState.selectedDate = candidate;
  agendaState.referenceDate = candidate;
}

function agendaSyncSelection(range) {
  if (agendaState.view === "day" && agendaState.filter !== "past") {
    agendaResolveDaySelection();
    return;
  }
  agendaEnsureSelectedDate(range);
}

function agendaSetFlash(message, type) {
  const flash = document.getElementById("agendaFlash");
  if (!flash) {
    return;
  }
  flash.textContent = message || "";
  flash.className = "agenda-flash" + (message ? " " + (type || "info") : "");
}

function agendaEnsureSelectedDate(range) {
  const availableDates = agendaState.items.map(function (item) {
    return item.date;
  });

  if (!agendaState.selectedDate) {
    agendaState.selectedDate = availableDates[0] || agendaTodayString();
  }

  const selected = agendaParseDate(agendaState.selectedDate);
  if (selected < agendaParseDate(range.start) || selected > agendaParseDate(range.end)) {
    agendaState.selectedDate = availableDates[0] || range.start;
  }
}

function agendaUpdateSummary(range) {
  const role = agendaCurrentRole();
  const totals = agendaSummaryForCurrentView();
  const roleBadge = document.getElementById("agendaRoleBadge");
  const rangeLabel = document.getElementById("agendaRangeLabel");
  const summary = document.getElementById("agendaSummaryText");
  const heroTitle = document.getElementById("agendaHeroTitle");
  const heroCopy = document.getElementById("agendaHeroCopy");

  if (roleBadge) {
    roleBadge.textContent = agendaRoleText(role);
  }
  if (rangeLabel) {
    rangeLabel.textContent = range.label;
  }
  if (summary) {
    summary.textContent = String(totals.visible || 0) + " bloques visibles · " + String(totals.pending || 0) + " pendientes · " + String(totals.active || 0) + " en curso · " + String(totals.past || 0) + " pasados";
  }
  if (heroTitle) {
    heroTitle.textContent = role === "admin" ? "Agenda del organizador" : "Mi agenda";
  }
  if (heroCopy) {
    heroCopy.textContent = role === "admin"
      ? "Consulta la operacion del evento por fecha y hora, con foco en lo pendiente y lo ya ejecutado."
      : "Consulta solo las fechas y horarios de los eventos para los que ya compraste ticket.";
  }

  [
    ["agendaPendingCount", totals.pending],
    ["agendaActiveCount", totals.active],
    ["agendaPastCount", totals.past],
    ["agendaVisibleCount", totals.visible],
  ].forEach(function (entry) {
    const node = document.getElementById(entry[0]);
    if (node) {
      node.textContent = String(entry[1] || 0);
    }
  });

  document.querySelectorAll("#agendaViewSwitch button[data-agenda-view]").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-agenda-view") === agendaState.view);
  });
  document.querySelectorAll("#agendaStatusSwitch button[data-agenda-filter]").forEach(function (button) {
    button.classList.toggle("active", button.getAttribute("data-agenda-filter") === agendaState.filter);
  });
}

function agendaChipMarkup(item) {
  return '<button type="button" class="agenda-chip ' + item.occurrenceStatus + '" data-agenda-date="' + escapeHtml(item.date) + '"><span class="agenda-chip-time">' + escapeHtml(item.startTime) + ' - ' + escapeHtml(item.endTime) + '</span><span class="agenda-chip-title">' + escapeHtml(item.title) + '</span></button>';
}

function agendaTimelineMarkup(item) {
  return '<article class="agenda-timeline-item ' + item.occurrenceStatus + '"><div class="agenda-timeline-time">' + escapeHtml(item.startTime) + ' - ' + escapeHtml(item.endTime) + ' · ' + escapeHtml(agendaStatusText(item.occurrenceStatus)) + '</div><h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.description || 'Sin descripcion') + '</p><div class="agenda-timeline-meta">' + escapeHtml(item.location || 'Ubicacion pendiente') + '</div></article>';
}

function agendaRenderMonth(range) {
  const calendar = document.getElementById("agendaCalendar");
  const byDate = agendaItemsByDate();
  const days = agendaBuildDateRange(range.start, range.end);

  calendar.innerHTML = '<div class="agenda-week-head">' + agendaWeekdayShort.map(function (label) {
    return '<span>' + label + '</span>';
  }).join("") + '</div><div class="agenda-month-grid">' + days.map(function (date) {
    const dateObject = agendaParseDate(date);
    const items = byDate[date] || [];
    const chips = items.slice(0, 3).map(agendaChipMarkup).join("");
    const extra = items.length > 3 ? '<div class="agenda-more">+' + String(items.length - 3) + ' mas</div>' : '';
    const classes = ["agenda-day-cell"];
    if (dateObject.getMonth() !== range.referenceMonth || dateObject.getFullYear() !== range.referenceYear) {
      classes.push("is-outside");
    }
    if (agendaIsSameDate(date, agendaTodayString())) {
      classes.push("is-today");
    }
    if (agendaIsSameDate(date, agendaState.selectedDate)) {
      classes.push("is-selected");
    }

    return '<article class="' + classes.join(" ") + '" data-agenda-date="' + escapeHtml(date) + '"><div class="agenda-day-top"><span class="agenda-day-number">' + dateObject.getDate() + '</span><span class="agenda-count-badge">' + items.length + '</span></div><div class="agenda-cell-items">' + (chips || '<div class="agenda-more">Sin bloques</div>') + extra + '</div></article>';
  }).join("") + '</div>';
}

function agendaRenderWeek(range) {
  const calendar = document.getElementById("agendaCalendar");
  const days = agendaBuildDateRange(range.start, range.end);

  calendar.innerHTML = '<div class="agenda-week-columns">' + days.map(function (date, index) {
    const items = agendaItemsForDate(date);
    const classes = ["agenda-week-column"];
    if (agendaIsSameDate(date, agendaTodayString())) {
      classes.push("is-today");
    }
    if (agendaIsSameDate(date, agendaState.selectedDate)) {
      classes.push("is-selected");
    }

    return '<article class="' + classes.join(" ") + '" data-agenda-date="' + escapeHtml(date) + '"><div class="agenda-week-column-head"><strong>' + agendaWeekdayShort[index] + ' ' + agendaParseDate(date).getDate() + '</strong><span>' + escapeHtml(agendaHumanDate(date, { month: "long" })) + '</span></div><div class="agenda-week-list">' + (items.length ? items.map(function (item) {
      return '<div class="agenda-item-card ' + item.occurrenceStatus + '" data-agenda-date="' + escapeHtml(date) + '"><div class="agenda-item-time">' + escapeHtml(item.startTime) + ' - ' + escapeHtml(item.endTime) + '</div><h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.location || 'Ubicacion pendiente') + '</p></div>';
    }).join("") : '<div class="agenda-empty">Sin bloques para este dia.</div>') + '</div></article>';
  }).join("") + '</div>';
}

function agendaRenderAgendaList(range) {
  const calendar = document.getElementById("agendaCalendar");
  const days = agendaBuildDateRange(range.start, range.end);
  const groups = days.map(function (date) {
    return {
      date: date,
      items: agendaItemsForDate(date),
    };
  }).filter(function (group) {
    return group.items.length > 0;
  });

  if (!groups.length) {
    calendar.innerHTML = '<div class="agenda-empty">No hay bloques para el rango y filtro seleccionados.</div>';
    return;
  }

  calendar.innerHTML = '<div class="agenda-list-groups">' + groups.map(function (group) {
    return '<section><div class="agenda-list-group-title" data-agenda-date="' + escapeHtml(group.date) + '">' + escapeHtml(agendaHumanDate(group.date, { weekday: "long", day: "numeric", month: "long" })) + '</div><div class="agenda-week-list">' + group.items.map(function (item) {
      return '<article class="agenda-list-card ' + item.occurrenceStatus + '" data-agenda-date="' + escapeHtml(group.date) + '"><div class="agenda-item-time">' + escapeHtml(item.startTime) + ' - ' + escapeHtml(item.endTime) + ' · ' + escapeHtml(agendaStatusText(item.occurrenceStatus)) + '</div><h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.description || 'Sin descripcion') + '</p><div class="agenda-list-meta">' + escapeHtml(item.location || 'Ubicacion pendiente') + '</div></article>';
    }).join("") + '</div></section>';
  }).join("") + '</div>';
}

function agendaRenderDay(range) {
  const calendar = document.getElementById("agendaCalendar");
  const date = agendaState.selectedDate || range.start;
  const items = agendaItemsForDate(date);

  calendar.innerHTML = '<div class="agenda-list-group-title">' + escapeHtml(agendaHumanDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) + '</div><div class="agenda-day-view-list">' + (items.length ? items.map(function (item) {
    return '<article class="agenda-item-card ' + item.occurrenceStatus + '"><div class="agenda-item-time">' + escapeHtml(item.startTime) + ' - ' + escapeHtml(item.endTime) + ' · ' + escapeHtml(agendaStatusText(item.occurrenceStatus)) + '</div><h4>' + escapeHtml(item.title) + '</h4><p>' + escapeHtml(item.description || 'Sin descripcion') + '</p><div class="agenda-item-meta">' + escapeHtml(item.location || 'Ubicacion pendiente') + '</div></article>';
  }).join("") : '<div class="agenda-empty">No hay bloques para este dia.</div>') + '</div>';
}

function agendaRenderSelectedDay() {
  const selectedTitle = document.getElementById("agendaSelectedTitle");
  const selectedHint = document.getElementById("agendaSelectedHint");
  const selectedCount = document.getElementById("agendaSelectedCount");
  const timeline = document.getElementById("agendaDayTimeline");
  const date = agendaState.selectedDate || agendaTodayString();
  const items = agendaItemsForDate(date);

  if (selectedTitle) {
    selectedTitle.textContent = agendaHumanDate(date, { weekday: "long", day: "numeric", month: "long" });
  }
  if (selectedHint) {
    selectedHint.textContent = items.length
      ? "Horario detallado para la fecha seleccionada."
      : "No hay bloques para el filtro actual en esta fecha.";
  }
  if (selectedCount) {
    selectedCount.textContent = String(items.length) + (items.length === 1 ? " bloque" : " bloques");
  }
  if (timeline) {
    timeline.innerHTML = items.length ? items.map(agendaTimelineMarkup).join("") : '<div class="agenda-empty">Selecciona otra fecha o cambia el filtro para ver mas actividad.</div>';
  }
}

function agendaRenderPanel() {
  const calendar = document.getElementById("agendaCalendar");
  if (!calendar) {
    return;
  }

  const role = agendaCurrentRole();
  const range = agendaRangeForState();
  agendaSyncSelection(range);
  agendaUpdateSummary(range);

  if (agendaState.loading) {
    calendar.innerHTML = '<div class="agenda-empty">Cargando agenda...</div>';
    return;
  }

  if (!agendaState.items.length) {
    calendar.innerHTML = role === "standard"
      ? (agendaState.view === "day" && agendaState.filter !== "past"
        ? '<div class="agenda-empty">No hay fechas futuras disponibles para los tickets que ya compraste.</div>'
        : '<div class="agenda-empty">No hay fechas de tus tickets para el rango seleccionado.</div>')
      : (agendaState.view === "day" && agendaState.filter !== "past"
        ? '<div class="agenda-empty">No hay dias futuros con eventos disponibles por ahora.</div>'
        : '<div class="agenda-empty">No hay eventos para el rango seleccionado. Prueba con otro periodo o cambia el filtro.</div>');
    agendaRenderSelectedDay();
    return;
  }

  if (agendaState.view === "month") {
    agendaRenderMonth(range);
  } else if (agendaState.view === "week") {
    agendaRenderWeek(range);
  } else if (agendaState.view === "day") {
    agendaRenderDay(range);
  } else {
    agendaRenderAgendaList(range);
  }

  agendaRenderSelectedDay();
}

function agendaShiftReference(direction) {
  const current = agendaState.referenceDate || agendaTodayString();
  if (agendaState.view === "day") {
    if (agendaState.filter !== "past") {
      const today = agendaTodayString();
      const selected = agendaState.selectedDate || current || today;
      const availableDates = agendaAvailableDates().filter(function (date) {
        return date >= today;
      });

      if (direction < 0) {
        const previous = availableDates.filter(function (date) {
          return date < selected;
        }).pop();

        if (previous) {
          agendaState.referenceDate = previous;
          agendaState.selectedDate = previous;
          return false;
        }

        if (selected > today) {
          agendaState.referenceDate = today;
          agendaState.selectedDate = today;
          return true;
        }

        return false;
      }

      const next = availableDates.find(function (date) {
        return date > selected;
      });

      if (next) {
        agendaState.referenceDate = next;
        agendaState.selectedDate = next;
        return false;
      }

      agendaState.referenceDate = agendaAddDays(selected, direction);
      agendaState.selectedDate = agendaState.referenceDate;
      return true;
    }

    agendaState.referenceDate = agendaAddDays(current, direction);
    agendaState.selectedDate = agendaState.referenceDate;
    return true;
  } else if (agendaState.view === "week") {
    agendaState.referenceDate = agendaAddDays(current, direction * 7);
    return true;
  } else if (agendaState.view === "agenda") {
    agendaState.referenceDate = agendaAddDays(current, direction * 21);
    return true;
  } else {
    const date = agendaParseDate(current);
    date.setMonth(date.getMonth() + direction, 1);
    agendaState.referenceDate = agendaFormatDate(date);
    return true;
  }

  return true;
}

async function loadAgendaPanel(force) {
  const calendar = document.getElementById("agendaCalendar");
  if (!calendar || agendaCurrentRole() === "guest") {
    return;
  }

  if (!agendaState.initialized) {
    initAgendaPanel();
  }

  if (agendaState.loading && !force) {
    return;
  }

  agendaState.loading = true;
  agendaRenderPanel();
  agendaSetFlash("", "");

  try {
    const range = agendaRangeForState();
    const requestRange = agendaRequestRangeForState();
    const params = new URLSearchParams({
      start: requestRange.start,
      end: requestRange.end,
      status: agendaState.filter,
    });
    const response = await serviceFetch(
      "agenda",
      "/calendar/data?" + params.toString(),
      sessionToken ? { headers: { Authorization: "Bearer " + sessionToken } } : undefined,
    );
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      throw new Error(payload.data.message || "No se pudo cargar la agenda");
    }

    agendaState.items = Array.isArray(payload.data.items) ? payload.data.items : [];
    agendaState.totals = payload.data.totals || { pending: 0, active: 0, past: 0, visible: 0, occurrences: 0 };
    agendaSyncSelection(range);
    agendaRenderPanel();

    if (!agendaState.items.length) {
      agendaSetFlash(
        agendaState.view === "day" && agendaState.filter !== "past"
          ? "No hay dias futuros con eventos. Puedes crear nuevos eventos o revisar otra vista."
          : "No hay bloques para este rango. Puedes revisar otros dias o crear eventos desde la seccion Eventos.",
        "info",
      );
    }
  } catch (error) {
    agendaState.items = [];
    agendaState.totals = { pending: 0, active: 0, past: 0, visible: 0, occurrences: 0 };
    agendaRenderPanel();
    agendaSetFlash(error.message || "No se pudo cargar la agenda", "error");
  } finally {
    agendaState.loading = false;
    agendaRenderPanel();
  }
}

function initAgendaPanel() {
  if (agendaState.initialized) {
    return;
  }

  agendaState.initialized = true;
  agendaState.referenceDate = agendaTodayString();
  agendaState.selectedDate = agendaTodayString();

  const prevButton = document.getElementById("agendaPrevBtn");
  const nextButton = document.getElementById("agendaNextBtn");
  const todayButton = document.getElementById("agendaTodayBtn");
  const calendar = document.getElementById("agendaCalendar");
  const viewSwitch = document.getElementById("agendaViewSwitch");
  const statusSwitch = document.getElementById("agendaStatusSwitch");

  if (prevButton) {
    prevButton.addEventListener("click", function () {
      if (agendaShiftReference(-1) === false) {
        agendaRenderPanel();
        return;
      }
      loadAgendaPanel(true);
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", function () {
      if (agendaShiftReference(1) === false) {
        agendaRenderPanel();
        return;
      }
      loadAgendaPanel(true);
    });
  }

  if (todayButton) {
    todayButton.addEventListener("click", function () {
      agendaState.referenceDate = agendaTodayString();
      agendaState.selectedDate = agendaTodayString();
      loadAgendaPanel(true);
    });
  }

  if (viewSwitch) {
    viewSwitch.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-agenda-view]");
      if (!button) {
        return;
      }
      agendaState.view = button.getAttribute("data-agenda-view") || "month";
      if (agendaState.view === "day") {
        const today = agendaTodayString();
        const anchor = agendaState.filter === "past"
          ? (agendaState.selectedDate && agendaState.selectedDate < today ? agendaState.selectedDate : today)
          : (agendaState.selectedDate && agendaState.selectedDate > today ? agendaState.selectedDate : today);
        agendaState.referenceDate = anchor;
        agendaState.selectedDate = anchor;
      }
      loadAgendaPanel(true);
    });
  }

  if (statusSwitch) {
    statusSwitch.addEventListener("click", function (event) {
      const button = event.target.closest("button[data-agenda-filter]");
      if (!button) {
        return;
      }
      agendaState.filter = button.getAttribute("data-agenda-filter") || "all";
      if (agendaState.view === "day") {
        const today = agendaTodayString();
        const anchor = agendaState.filter === "past"
          ? (agendaState.selectedDate && agendaState.selectedDate < today ? agendaState.selectedDate : today)
          : (agendaState.selectedDate && agendaState.selectedDate > today ? agendaState.selectedDate : today);
        agendaState.referenceDate = anchor;
        agendaState.selectedDate = anchor;
      }
      loadAgendaPanel(true);
    });
  }

  if (calendar) {
    calendar.addEventListener("click", function (event) {
      const target = event.target.closest("[data-agenda-date]");
      if (!target) {
        return;
      }
      agendaState.selectedDate = target.getAttribute("data-agenda-date") || agendaTodayString();
      if (agendaState.view === "day") {
        agendaState.referenceDate = agendaState.selectedDate;
      }
      agendaRenderPanel();
    });
  }
}

function initNotificationsPanel() {
  if (notificationsState.initialized) {
    return;
  }

  const reloadButton = document.getElementById("notifReloadBtn");
  if (reloadButton) {
    reloadButton.addEventListener("click", function () {
      loadNotificationsPanel(true);
    });
  }

  const ticketSelect = document.getElementById("notifTicketSelect");
  if (ticketSelect) {
    ticketSelect.addEventListener("change", function () {
      loadNotificationAudience(ticketSelect.value || "");
    });
  }

  const sendButton = document.getElementById("notifSendBtn");
  if (sendButton) {
    sendButton.addEventListener("click", function () {
      sendNotificationCampaign();
    });
  }

  notificationsState.initialized = true;
}

function setNotifStatus(message, type) {
  const status = document.getElementById("notifSendStatus");
  if (!status) {
    return;
  }
  status.textContent = message || "";
  status.className = "notif-status" + (message ? " show " + (type || "info") : "");
}

function applyNotificationsRoleUi() {
  const role = normalizeRole(currentUser && currentUser.accountType);
  const grid = document.querySelector("#panel-notificaciones .notifications-grid");
  const listTitle = document.getElementById("notifListTitle");
  const listHint = document.getElementById("notifListHint");
  const composerCard = document.getElementById("notifComposerCard");
  const composerTitle = document.getElementById("notifComposerTitle");
  const composerHint = document.getElementById("notifComposerHint");

  if (role === "admin") {
    if (listTitle) listTitle.textContent = "Ventas recientes";
    if (listHint) listHint.textContent = "Solo compras registradas para tus tickets.";
    if (composerTitle) composerTitle.textContent = "Mensaje a compradores";
    if (composerHint) composerHint.textContent = "Envia un correo personalizado a quienes compraron un ticket tuyo.";
    if (composerCard) composerCard.style.display = "block";
    if (grid) grid.style.gridTemplateColumns = "minmax(0, 1.15fr) minmax(0, 0.85fr)";
    return;
  }

  if (listTitle) listTitle.textContent = "Mis avisos";
  if (listHint) listHint.textContent = "Aqui veras los avisos y correos enviados por organizadores a los tickets que compraste.";
  if (composerCard) composerCard.style.display = "none";
  if (grid) grid.style.gridTemplateColumns = "minmax(0, 1fr)";
}

function renderNotificationList(items) {
  const list = document.getElementById("notifList");
  if (!list) {
    return;
  }

  const role = normalizeRole(currentUser && currentUser.accountType);

  if (!items || !items.length) {
    list.innerHTML = role === "admin"
      ? '<div class="notifications-empty">Aun no hay ventas registradas.</div>'
      : '<div class="notifications-empty">Aun no tienes avisos relacionados con tickets comprados.</div>';
    return;
  }

  list.innerHTML = items.map(function (item) {
    const subtitle = role === "admin"
      ? escapeHtml(item.recipient || "")
      : "Mensaje recibido en tu cuenta";
    return '<div class="notification-item"><strong>' + escapeHtml(item.message || "") + '</strong><small>' + subtitle + '</small></div>';
  }).join("");
}

function renderNotificationAudience(audience) {
  const meta = document.getElementById("notifAudienceMeta");
  if (!meta) {
    return;
  }

  if (!audience) {
    meta.innerHTML = '<span>Selecciona un ticket para ver compradores</span>';
    return;
  }

  meta.innerHTML = [
    '<span>' + String(audience.totalRecipients || 0) + ' compradores</span>',
    '<span>' + String(audience.totalOrders || 0) + ' ordenes</span>',
    '<span>' + String(audience.totalTickets || 0) + ' tickets</span>',
  ].join("");
}

async function loadNotificationList() {
  const list = document.getElementById("notifList");
  if (!list) {
    return;
  }

  const recipient = currentUser && currentUser.email ? currentUser.email : "";
  if (!recipient) {
    list.innerHTML = '<div class="notifications-empty">Inicia sesion para ver notificaciones.</div>';
    return;
  }

  list.innerHTML = '<div class="notifications-empty">Cargando notificaciones...</div>';
  try {
    const response = await serviceFetch("notification", "/data?recipient=" + encodeURIComponent(recipient));
    const payload = await response.json().catch(function () { return []; });
    if (!response.ok) {
      throw new Error(payload.message || "No se pudieron cargar las notificaciones");
    }
    renderNotificationList(Array.isArray(payload) ? payload : []);
  } catch (error) {
    list.innerHTML = '<div class="notifications-empty">' + escapeHtml(error.message || "No se pudieron cargar las notificaciones") + '</div>';
  }
}

async function loadNotificationTicketTypes() {
  const select = document.getElementById("notifTicketSelect");
  if (!select) {
    return;
  }

  const role = normalizeRole(currentUser && currentUser.accountType);
  if (role !== "admin") {
    select.innerHTML = '<option value="">Solo organizadores</option>';
    renderNotificationAudience(null);
    return;
  }

  const organizerEmail = currentUser && currentUser.email ? currentUser.email : "";
  const organizerId = currentUser && currentUser.id ? currentUser.id : "";
  select.innerHTML = '<option value="">Cargando tickets...</option>';
  try {
    const params = new URLSearchParams();
    if (organizerEmail) {
      params.set("organizerEmail", organizerEmail);
    }
    if (organizerId) {
      params.set("organizerId", organizerId);
    }
    const response = await serviceFetch("notification", "/campaigns/tickets" + (params.toString() ? "?" + params.toString() : ""));
    const payload = await response.json().catch(function () { return []; });
    if (!response.ok) {
      throw new Error(payload.message || "No se pudieron cargar los tickets");
    }

    const availableTickets = Array.isArray(payload)
      ? payload.filter(function (ticket) {
        return ticket && ticket.isActive !== false;
      })
      : [];
    notificationsState.ticketTypes = availableTickets;
    if (!notificationsState.ticketTypes.length) {
      select.innerHTML = '<option value="">Sin tickets activos</option>';
      renderNotificationAudience(null);
      return;
    }

    select.innerHTML = '<option value="">Selecciona un ticket</option>' + notificationsState.ticketTypes.map(function (ticket) {
      return '<option value="' + escapeHtml(ticket.id) + '">' + escapeHtml(ticket.name || "Ticket") + '</option>';
    }).join("");
    renderNotificationAudience(null);
  } catch (error) {
    select.innerHTML = '<option value="">Error al cargar tickets</option>';
    renderNotificationAudience(null);
  }
}

async function loadNotificationAudience(ticketTypeId) {
  const meta = document.getElementById("notifAudienceMeta");
  if (!meta) {
    return;
  }
  if (!ticketTypeId) {
    renderNotificationAudience(null);
    return;
  }

  const organizerEmail = currentUser && currentUser.email ? currentUser.email : "";
  const organizerId = currentUser && currentUser.id ? currentUser.id : "";
  meta.innerHTML = '<span>Cargando audiencia...</span>';
  try {
    const params = new URLSearchParams({ includeAdmin: "false" });
    if (organizerEmail) {
      params.set("organizerEmail", organizerEmail);
    }
    if (organizerId) {
      params.set("organizerId", organizerId);
    }
    const response = await serviceFetch("notification", "/campaigns/tickets/" + encodeURIComponent(ticketTypeId) + "/audience?" + params.toString());
    const payload = await response.json().catch(function () { return null; });
    if (!response.ok) {
      throw new Error(payload.message || "No se pudo cargar la audiencia");
    }
    notificationsState.audience = payload;
    renderNotificationAudience(payload);
  } catch (error) {
    meta.innerHTML = '<span>' + escapeHtml(error.message || "No se pudo cargar la audiencia") + '</span>';
  }
}

async function sendNotificationCampaign() {
  const select = document.getElementById("notifTicketSelect");
  const subjectInput = document.getElementById("notifSubject");
  const messageInput = document.getElementById("notifMessage");
  const sendButton = document.getElementById("notifSendBtn");
  if (!select || !subjectInput || !messageInput || !sendButton) {
    return;
  }

  const ticketTypeId = select.value || "";
  const subject = subjectInput.value.trim();
  const message = messageInput.value.trim();
  if (!ticketTypeId) {
    setNotifStatus("Selecciona un ticket para enviar el mensaje.", "err");
    return;
  }
  if (!subject || !message) {
    setNotifStatus("Completa el asunto y el mensaje.", "err");
    return;
  }

  const organizerEmail = currentUser && currentUser.email ? currentUser.email : "";
  const organizerId = currentUser && currentUser.id ? currentUser.id : "";
  const senderName = currentUser && currentUser.name ? currentUser.name : organizerEmail;

  sendButton.disabled = true;
  setNotifStatus("Enviando correo a compradores...", "info");
  try {
    const response = await serviceFetch("notification", "/campaigns/tickets/send", {
      method: "POST",
      body: {
        ticketTypeId: ticketTypeId,
        subject: subject,
        message: message,
        senderName: senderName,
        organizerEmail: organizerEmail,
        organizerId: organizerId,
      },
    });
    const payload = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(payload.message || "No se pudo enviar el correo");
    }

    const sentCount = payload.emailsSent || 0;
    setNotifStatus("Correo enviado a " + sentCount + " comprador(es).", "ok");
  } catch (error) {
    setNotifStatus(error.message || "No se pudo enviar el correo", "err");
  } finally {
    sendButton.disabled = false;
  }
}

function loadNotificationsPanel(force) {
  initNotificationsPanel();
  if (notificationsState.loading && !force) {
    return;
  }

  notificationsState.loading = true;
  applyNotificationsRoleUi();
  Promise.resolve()
    .then(function () {
      return loadNotificationList();
    })
    .then(function () {
      return loadNotificationTicketTypes();
    })
    .finally(function () {
      notificationsState.loading = false;
    });
}

function showSession(preferredPanel) {
  currentUser = normalizeSessionUser(currentUser, sessionToken, "");
  if (!currentUser) {
    throw new Error("No se pudo cargar el perfil de la sesion");
  }

  const card = document.getElementById("card");
  const cardInner = document.getElementById("cardInner");
  const shell = document.getElementById("vSession");
  const displayName = (currentUser.name || "").trim() || ((currentUser.email || "").split("@")[0] || "usuario");
  const role = normalizeRole(currentUser.accountType || "guest");
  const roleElement = document.getElementById("sessRole");
  const targetPanel = isPanelAllowed(preferredPanel || "inicio", role) ? (preferredPanel || "inicio") : "inicio";

  currentUser.accountType = role;
  card.classList.add("app-mode");
  cardInner.style.display = "none";
  shell.style.display = "flex";
  document.getElementById("sessGreet").textContent = "Hola, " + displayName + "!";
  document.getElementById("sessEmail").textContent = currentUser.email;
  document.getElementById("sessId").textContent = currentUser.id || "No disponible";
  roleElement.textContent = roleLabel(role);
  roleElement.className = "role-pill " + role;

  const navName = document.getElementById("profileNavName");
  if (navName) navName.textContent = displayName.split(" ")[0] || "";
  renderProfileAvatar(currentUser.avatarUrl || null);
  applyRoleInterface(role);
  switchPanel(targetPanel, document.getElementById(tabIdForPanel(targetPanel)));
  pushSessionToEmbeddedServices();
}

function restoreSessionState() {
  const storedToken = localStorage.getItem(storageKeys.token);
  const storedRefreshToken = localStorage.getItem(storageKeys.refreshToken);
  const storedUser = localStorage.getItem(storageKeys.user);
  const storedExpiresAt = localStorage.getItem(storageKeys.expiresAt);
  const lastPanel = getParam("panel") || localStorage.getItem(storageKeys.lastPanel) || "inicio";

  if (!storedToken || !storedUser || !storedExpiresAt) {
    clearSessionStorage();
    return false;
  }

  const expiresAt = Number(storedExpiresAt);
  if (!expiresAt || Date.now() > expiresAt) {
    if (!storedRefreshToken) {
      clearSessionStorage();
      setAlert("alertLogin", "La sesion expiro. Inicia sesion nuevamente.", "info");
      return false;
    }
  }

  try {
    currentUser = normalizeSessionUser(JSON.parse(storedUser), storedToken, "");
    sessionToken = storedToken;
    refreshToken = storedRefreshToken || "";
  } catch {
    clearSessionStorage();
    return false;
  }

  if (!currentUser) {
    clearSessionStorage();
    return false;
  }

  if (!expiresAt || Date.now() > expiresAt) {
    refreshSession(lastPanel)
      .then(function () {
        showSession(lastPanel);
        startSessionWatcher();
      })
      .catch(function () {
        clearSessionStorage();
        setAlert("alertLogin", "La sesion expiro. Inicia sesion nuevamente.", "info");
      });
    return true;
  }

  showSession(lastPanel);
  startSessionWatcher();
  return true;
}

async function doLogin() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPw").value;
  const button = document.getElementById("loginBtn");

  if (!email || !password) {
    setAlert("alertLogin", "Por favor completa todos los campos", "err");
    return;
  }

  button.disabled = true;
  button.textContent = isRemoteDeployment() ? "Despertando servicios..." : "Verificando...";

  try {
    if (isRemoteDeployment()) {
      const wakeResult = await wakeRenderServices({ silent: false });
      if (!wakeResult.ok) {
        return;
      }
    }

    button.textContent = "Verificando...";

    const response = await serviceFetch("user", "/auth/login", {
      method: "POST",
      body: { email: email, password: password },
    });
    const payload = await readResponsePayload(response);
    const data = payload.data;
    const rawText = payload.rawText.trim();

    if (!response.ok) {
      if (response.status >= 500 && isRemoteDeployment()) {
        throw new Error(data.message || "El backend no respondio correctamente. Pulsa 'Despertar servicios' y reintenta en unos segundos.");
      }
      throw new Error(data.message || "Credenciales incorrectas");
    }

    if (!data.accessToken || typeof data.accessToken !== "string") {
      let detail = "";

      if (!rawText) {
        detail = " El servicio devolvio una respuesta vacia.";
      } else if (rawText.startsWith("<")) {
        detail = " El servicio devolvio HTML en lugar de JSON.";
      }

      throw new Error((data.message || "La respuesta del login no incluyo un token valido") + detail);
    }

    sessionToken = data.accessToken;
    refreshToken = data.refreshToken || "";
    currentUser = normalizeSessionUser(data.user, sessionToken, email);
    if (!currentUser) {
      throw new Error("La respuesta del login no incluyo un usuario valido");
    }

    const preferredPanel = getParam("panel") || "inicio";
    saveSessionState(preferredPanel);
    showSession(preferredPanel);
    startSessionWatcher();
  } catch (error) {
    setAlert("alertLogin", error.message, "err");
  } finally {
    button.disabled = false;
    button.textContent = "Iniciar sesion";
  }
}

async function doRegister() {
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPw").value;
  const accountType = document.getElementById("regType").value;
  const button = document.getElementById("regBtn");

  if (!name || !email || !password) {
    setAlert("alertReg", "Por favor completa todos los campos", "err");
    return;
  }

  if (password.length < 8) {
    setAlert("alertReg", "La contrasena debe tener minimo 8 caracteres", "err");
    return;
  }

  button.disabled = true;
  button.textContent = "Creando cuenta...";

  try {
    const response = await serviceFetch("user", "/data", {
      method: "POST",
      body: {
        name: name,
        email: email,
        password: password,
        accountType: accountType,
      },
    });
    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.message || "No se pudo crear la cuenta");
    }

    if (data.confirmationPreviewUrl) {
      setAlertWithAction(
        "alertReg",
        "Cuenta creada. En este entorno local no hay SMTP configurado, asi que debes confirmar la cuenta manualmente.",
        "ok",
        data.confirmationPreviewUrl,
        "Abrir enlace de confirmacion",
      );
      return;
    }

    setAlert("alertReg", "Cuenta creada. Revisa tu correo para activarla antes de iniciar sesion.", "ok");
    setTimeout(function () {
      showView("vLogin");
    }, 2600);
  } catch (error) {
    setAlert("alertReg", error.message, "err");
  } finally {
    button.disabled = false;
    button.textContent = "Registrarme en EventHive";
  }
}

function doForgot() {
  const email = document.getElementById("forgotEmail").value.trim();
  if (!email) {
    setAlert("alertForgot", "Ingresa tu correo electronico", "err");
    return;
  }

  serviceFetch("user", "/auth/forgot-password", {
    method: "POST",
    body: { email: email },
  })
    .then(async function (response) {
      const data = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) {
        throw new Error(data.message || "No se pudo iniciar el restablecimiento");
      }
      if (data.resetPreviewUrl) {
        setAlertWithAction(
          "alertForgot",
          "En este entorno local no hay SMTP configurado, asi que debes abrir manualmente el enlace de restablecimiento.",
          "ok",
          data.resetPreviewUrl,
          "Abrir enlace de restablecimiento",
        );
        return;
      }

      setAlert("alertForgot", "Si esa cuenta existe, recibiras las instrucciones en tu bandeja de entrada en los proximos minutos.", "ok");
    })
    .catch(function (error) {
      setAlert("alertForgot", error.message, "err");
    });
}

async function doResetPassword() {
  const token = getParam("resetToken");
  const password = document.getElementById("resetPw").value;
  const confirm = document.getElementById("resetPwConfirm").value;
  const button = document.getElementById("resetBtn");

  if (!token) {
    setAlert("alertReset", "El enlace de recuperacion no es valido.", "err");
    return;
  }
  if (!password || password.length < 8) {
    setAlert("alertReset", "La contrasena debe tener minimo 8 caracteres", "err");
    return;
  }
  if (password !== confirm) {
    setAlert("alertReset", "Las contrasenas no coinciden", "err");
    return;
  }

  button.disabled = true;
  button.textContent = "Guardando...";

  try {
    const response = await serviceFetch("user", "/auth/reset-password", {
      method: "POST",
      body: { token: token, password: password },
    });
    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.message || "No se pudo restablecer la contrasena");
    }

    showView("vLogin");
    setAlert("alertLogin", "Contrasena actualizada correctamente. Ya puedes iniciar sesion.", "ok");
    window.history.replaceState({}, "", "/");
  } catch (error) {
    setAlert("alertReset", error.message, "err");
  } finally {
    button.disabled = false;
    button.textContent = "Guardar nueva contrasena";
  }
}

function openService(serviceKey, path) {
  if (serviceKey === "agenda") {
    const url = new URL("/", window.location.origin);
    url.searchParams.set("panel", "agenda");
    window.open(url.toString(), "_blank", "noopener");
    return;
  }

  let targetPath = path || "";
  if (serviceKey === "event") {
    const effectiveRole = normalizeRole((currentUser && currentUser.accountType) || "guest");
    targetPath = effectiveRole === "admin" ? (path || "") : (path || "?mode=viewer");
  }
  if (serviceKey === "credential") {
    const effectiveRole = normalizeRole((currentUser && currentUser.accountType) || "guest");
    targetPath = path || (effectiveRole === "admin" ? "/staff" : "/client");
  }
  if (serviceKey === "ticketing") {
    const effectiveRole = normalizeRole((currentUser && currentUser.accountType) || "guest");
    targetPath = effectiveRole === "admin" ? "/organizer" : "/client";
  }

  const url = new URL(serviceUrl(serviceKey, targetPath), window.location.origin);
  if (serviceKey === "ticketing" && sessionToken) {
    url.hash = "token=" + encodeURIComponent(sessionToken);
    if (refreshToken) {
      url.hash += "&refreshToken=" + encodeURIComponent(refreshToken);
    }
  }

  window.open(url.toString(), "_blank", "noopener");
}

function doLogout(reason) {
  sessionToken = "";
  refreshToken = "";
  currentUser = null;
  stopSessionWatcher();
  clearSessionStorage();

  document.getElementById("card").classList.remove("app-mode");
  document.getElementById("vSession").style.display = "none";
  document.getElementById("cardInner").style.display = "block";
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPw").value = "";
  showView("vLogin");

  if (reason === "expired") {
    setAlert("alertLogin", "La sesion expiro. Inicia sesion nuevamente.", "info");
  }
}

function copyToken() {
  if (!sessionToken || !navigator.clipboard) {
    return;
  }

  navigator.clipboard.writeText(sessionToken).then(function () {
    const button = document.getElementById("copyTokenPanel");
    if (!button) {
      return;
    }
    button.textContent = "Copiado";
    setTimeout(function () {
      button.textContent = "Copiar token";
    }, 1500);
  });
}

window.addEventListener("message", function (event) {
  if (event.data && event.data.type === "eventhive:request-session") {
    replySessionToTarget(event.source);
  }
});

document.addEventListener("keydown", function (event) {
  if (event.key !== "Enter") {
    return;
  }

  if (document.getElementById("vLogin").classList.contains("active")) {
    doLogin();
    return;
  }
  if (document.getElementById("vRegister").classList.contains("active")) {
    doRegister();
    return;
  }
  if (document.getElementById("vForgot").classList.contains("active")) {
    doForgot();
  }
});

window.addEventListener("DOMContentLoaded", function () {
  initAgendaPanel();
  document.getElementById("tpLogin").innerHTML = eyeOpen;
  document.getElementById("tpReg").innerHTML = eyeOpen;
  document.getElementById("tpReset").innerHTML = eyeOpen;

  const wakeButton = document.getElementById("wakeServicesBtn");
  if (wakeButton) {
    wakeButton.style.display = isRemoteDeployment() ? "" : "none";
  }

  const confirmed = getParam("confirmed");
  const resetParam = getParam("resetToken");

  if (confirmed === "1") {
    showView("vLogin");
    setAlert("alertLogin", "Correo confirmado correctamente. Ya puedes iniciar sesion.", "ok");
    return;
  }
  if (confirmed === "expired") {
    showView("vLogin");
    setAlert("alertLogin", "El enlace de confirmacion expiro. Debes solicitar uno nuevo.", "err");
    return;
  }
  if (confirmed === "invalid") {
    showView("vLogin");
    setAlert("alertLogin", "El enlace de confirmacion no es valido.", "err");
    return;
  }
  if (resetParam) {
    showView("vReset");
    return;
  }

  const changePasswordParam = getParam("changePasswordToken");
  if (changePasswordParam) {
    confirmPasswordChangeFromToken(changePasswordParam);
    return;
  }

  showView("vLogin");
  wakeRenderServices({ silent: true }).catch(function () {
    return null;
  });
  restoreSessionState();
});

// ──────────────────────────────────────────────
// PANEL PERFIL
// ──────────────────────────────────────────────

function loadProfilePanel() {
  if (!currentUser) return;
  const nameInput = document.getElementById("profileNameInput");
  const emailDisplay = document.getElementById("profileEmailDisplay");
  const sidebarName = document.getElementById("profileSidebarName");
  const sidebarEmail = document.getElementById("profileSidebarEmail");
  const sidebarRole = document.getElementById("profileSidebarRole");
  const navName = document.getElementById("profileNavName");

  if (nameInput) nameInput.value = currentUser.name || "";
  if (emailDisplay) emailDisplay.value = currentUser.email || "";
  if (sidebarName) sidebarName.textContent = currentUser.name || "";
  if (sidebarEmail) sidebarEmail.textContent = currentUser.email || "";
  if (sidebarRole) {
    sidebarRole.textContent = roleLabel(normalizeRole(currentUser.accountType || "guest"));
    sidebarRole.className = "role-pill " + normalizeRole(currentUser.accountType || "guest");
  }
  if (navName) navName.textContent = (currentUser.name || "").split(" ")[0] || "";

  const avatarUrl = currentUser.avatarUrl || null;
  renderProfileAvatar(avatarUrl);
}

function renderProfileAvatar(url) {
  const big = document.getElementById("profileAvatarBig");
  const thumb = document.getElementById("profileAvatarThumb");
  const svg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  const bigSvg = `<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  if (url) {
    if (big) big.innerHTML = `<img src="${url}" alt="avatar">`;
    if (thumb) thumb.innerHTML = `<img src="${url}" alt="avatar">`;
  } else {
    if (big) big.innerHTML = bigSvg;
    if (thumb) thumb.innerHTML = svg;
  }
}

function handleProfilePhotoChange(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setAlert("alertProfile", "Solo se permiten archivos de imagen.", "err");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    setAlert("alertProfile", "La imagen no puede superar 10 MB.", "err");
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = async function () {
      const MAX = 300;
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
      else { w = Math.round(w * MAX / h); h = MAX; }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      renderProfileAvatar(dataUrl);
      await saveProfilePhoto(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveProfilePhoto(dataUrl) {
  if (!sessionToken || !currentUser) return;
  try {
    const response = await serviceFetch("user", "/profile", {
      method: "PUT",
      headers: { Authorization: "Bearer " + sessionToken },
      body: { avatarUrl: dataUrl },
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) throw new Error(payload.data.message || "Error al guardar la foto");
    if (payload.data.user && payload.data.user.avatarUrl !== undefined) {
      currentUser.avatarUrl = payload.data.user.avatarUrl;
      saveSessionState(localStorage.getItem(storageKeys.lastPanel) || "inicio");
    }
    setAlert("alertProfile", "Foto actualizada correctamente.", "ok");
  } catch (err) {
    setAlert("alertProfile", err.message || "Error al guardar la foto.", "err");
    renderProfileAvatar(currentUser.avatarUrl || null);
  }
}

async function saveProfile() {
  if (!sessionToken || !currentUser) return;
  const nameInput = document.getElementById("profileNameInput");
  const pwInput = document.getElementById("profileNamePw");
  const btn = document.getElementById("profileSaveBtn");
  const name = (nameInput && nameInput.value.trim()) || "";
  const pw = (pwInput && pwInput.value) || "";
  if (!name || name.length < 2) {
    setAlert("alertProfile", "El nombre debe tener al menos 2 caracteres.", "err");
    return;
  }
  if (!pw) {
    setAlert("alertProfile", "Introduce tu contrasena actual para guardar los cambios.", "err");
    if (pwInput) pwInput.focus();
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }
  try {
    const response = await serviceFetch("user", "/profile", {
      method: "PUT",
      headers: { Authorization: "Bearer " + sessionToken },
      body: { name: name, currentPassword: pw },
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) throw new Error(payload.data.message || "Error al guardar");
    currentUser.name = name;
    saveSessionState(localStorage.getItem(storageKeys.lastPanel) || "inicio");
    const sidebarName = document.getElementById("profileSidebarName");
    const navName = document.getElementById("profileNavName");
    const greet = document.getElementById("sessGreet");
    if (sidebarName) sidebarName.textContent = name;
    if (navName) navName.textContent = name.split(" ")[0] || "";
    if (greet) greet.textContent = "Hola, " + name + "!";
    if (pwInput) pwInput.value = "";
    setAlert("alertProfile", "Nombre actualizado correctamente.", "ok");
  } catch (err) {
    setAlert("alertProfile", err.message || "Error al guardar el perfil.", "err");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Guardar cambios"; }
  }
}

async function requestPasswordChange() {
  const currentPw = document.getElementById("profileCurrentPw");
  const newPw = document.getElementById("profileNewPw");
  const confirmPw = document.getElementById("profileConfirmPw");
  const btn = document.getElementById("profileChangePwBtn");

  if (!currentPw || !newPw || !confirmPw) return;
  const cur = currentPw.value;
  const nw = newPw.value;
  const conf = confirmPw.value;

  if (!cur) { setAlert("alertSecurity", "Introduce tu contrasena actual.", "err"); return; }
  if (nw.length < 8) { setAlert("alertSecurity", "La nueva contrasena debe tener al menos 8 caracteres.", "err"); return; }
  if (nw !== conf) { setAlert("alertSecurity", "Las contrasenas nuevas no coinciden.", "err"); return; }

  if (btn) { btn.disabled = true; btn.textContent = "Enviando..."; }
  try {
    const response = await serviceFetch("user", "/auth/request-password-change", {
      method: "POST",
      headers: { Authorization: "Bearer " + sessionToken },
      body: { currentPassword: cur, newPassword: nw },
    });
    const payload = await readResponsePayload(response);
    if (!response.ok) throw new Error(payload.data.message || "Error al procesar el cambio");

    const form = document.getElementById("securityForm");
    const sent = document.getElementById("securityEmailSent");
    const emailTarget = document.getElementById("securityEmailTarget");
    if (form) form.style.display = "none";
    if (sent) sent.style.display = "block";
    if (emailTarget && currentUser) emailTarget.textContent = currentUser.email || "";

    if (payload.data.previewUrl) {
      console.info("[dev] Enlace de confirmacion:", payload.data.previewUrl);
    }
  } catch (err) {
    setAlert("alertSecurity", err.message || "No se pudo enviar el correo de confirmacion.", "err");
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2H3v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V2z"/><path d="m7 10 3 3 7-7"/></svg> Solicitar cambio de contrasena`; }
  }
}

function resetSecurityForm() {
  const form = document.getElementById("securityForm");
  const sent = document.getElementById("securityEmailSent");
  if (form) form.style.display = "";
  if (sent) sent.style.display = "none";
  const cur = document.getElementById("profileCurrentPw");
  const nw = document.getElementById("profileNewPw");
  const conf = document.getElementById("profileConfirmPw");
  if (cur) cur.value = "";
  if (nw) nw.value = "";
  if (conf) conf.value = "";
  setAlert("alertSecurity", "", "");
}

function switchProfileTab(tabName, btn) {
  document.querySelectorAll(".profile-tab").forEach(function (t) { t.classList.remove("active"); });
  document.querySelectorAll(".profile-sidenav-btn").forEach(function (b) { b.classList.remove("active"); });
  const tab = document.getElementById("profileTab" + tabName.charAt(0).toUpperCase() + tabName.slice(1));
  if (tab) tab.classList.add("active");
  if (btn) btn.classList.add("active");
}

async function confirmPasswordChangeFromToken(token) {
  try {
    const response = await serviceFetch("user", "/auth/confirm-password-change", {
      method: "POST",
      body: { token: token },
    });
    const payload = await readResponsePayload(response);
    showView("vLogin");
    if (response.ok) {
      setAlert("alertLogin", "Contrasena cambiada correctamente. Por favor inicia sesion de nuevo.", "ok");
    } else {
      const reason = (payload.data && payload.data.message) || "El enlace no es valido o ha expirado.";
      setAlert("alertLogin", reason, "err");
    }
  } catch {
    showView("vLogin");
    setAlert("alertLogin", "No se pudo confirmar el cambio de contrasena. El enlace puede haber expirado.", "err");
  }
}