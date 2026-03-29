let sessionToken = "";
let refreshToken = "";
let currentUser = null;
let sessionTimer = null;
let refreshInFlight = null;

const hostName = window.location.hostname || "localhost";
const isLocalHost = hostName === "localhost" || hostName === "127.0.0.1";
const useSameOriginProxy = !isLocalHost || window.location.port === "3009";
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

const eyeOpen = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
const eyeOff = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

function serviceBase(serviceKey) {
  if (!Object.prototype.hasOwnProperty.call(servicePaths, serviceKey)) {
    throw new Error("Servicio no soportado");
  }

  if (!useSameOriginProxy) {
    return "http://" + hostName + ":" + servicePorts[serviceKey];
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

  [document.getElementById("ticketingFrame"), document.getElementById("eventFrame")].forEach(function (frame) {
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

  document.querySelectorAll(".admin-only").forEach(function (node) {
    node.style.display = effectiveRole === "admin" ? "" : "none";
  });
  document.querySelectorAll(".standard-only").forEach(function (node) {
    node.style.display = effectiveRole === "standard" || effectiveRole === "admin" ? "" : "none";
  });
  document.querySelectorAll(".guest-only").forEach(function (node) {
    node.style.display = effectiveRole === "guest" ? "" : "none";
  });

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

  const appMain = document.getElementById("appMain");
  if (appMain) {
    appMain.classList.toggle("service-mode", name === "tickets" || name === "eventos");
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
    ensureEmbeddedService("ticketingFrame", "ticketing", effectiveRole === "admin" ? "/organizer" : "/client");
  }

  if (name === "eventos") {
    ensureEmbeddedService("eventFrame", "event", "");
  }

  if (sessionToken && currentUser && panel) {
    localStorage.setItem(storageKeys.lastPanel, name);
  }
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
  applyRoleInterface(role);
  switchPanel(targetPanel, document.getElementById(tabIdForPanel(targetPanel)));
  pushSessionToEmbeddedServices();
}

function restoreSessionState() {
  const storedToken = localStorage.getItem(storageKeys.token);
  const storedRefreshToken = localStorage.getItem(storageKeys.refreshToken);
  const storedUser = localStorage.getItem(storageKeys.user);
  const storedExpiresAt = localStorage.getItem(storageKeys.expiresAt);
  const lastPanel = localStorage.getItem(storageKeys.lastPanel) || "inicio";

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
  button.textContent = "Verificando...";

  try {
    const response = await serviceFetch("user", "/auth/login", {
      method: "POST",
      body: { email: email, password: password },
    });
    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.message || "Credenciales incorrectas");
    }

    if (!data.accessToken || typeof data.accessToken !== "string") {
      throw new Error(data.message || "La respuesta del login no incluyo un token valido");
    }

    sessionToken = data.accessToken;
    refreshToken = data.refreshToken || "";
    currentUser = normalizeSessionUser(data.user, sessionToken, email);
    if (!currentUser) {
      throw new Error("La respuesta del login no incluyo un usuario valido");
    }

    saveSessionState("inicio");
    showSession("inicio");
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

    const preview = data.confirmationPreviewUrl ? " En este entorno no hay SMTP configurado, asi que puedes abrir el enlace de confirmacion manual: " + data.confirmationPreviewUrl : "";
    setAlert("alertReg", "Cuenta creada. Revisa tu correo para activarla antes de iniciar sesion." + preview, "ok");
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
      const preview = data.resetPreviewUrl ? " En este entorno no hay SMTP configurado, asi que puedes abrir manualmente: " + data.resetPreviewUrl : "";
      setAlert("alertForgot", "Si esa cuenta existe, recibiras las instrucciones en tu bandeja de entrada en los proximos minutos." + preview, "ok");
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
  let targetPath = path || "";
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
  document.getElementById("tpLogin").innerHTML = eyeOpen;
  document.getElementById("tpReg").innerHTML = eyeOpen;
  document.getElementById("tpReset").innerHTML = eyeOpen;

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

  showView("vLogin");
  restoreSessionState();
});