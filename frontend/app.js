const host = window.location.hostname;
const config = window.__APP_CONFIG__ || {};
const configuredEndpoints = config.serviceEndpoints || {};
const deployment = config.deployment || 'local';

function normalizeBaseUrl(value, fallback) {
  return String(value || fallback || '')
    .trim()
    .replace(/\/+$/, '');
}

const serviceBases = {
  users: normalizeBaseUrl(configuredEndpoints.users, `http://${host}:3000/users`),
  events: normalizeBaseUrl(configuredEndpoints.events, `http://${host}:3001/events`),
  tickets: normalizeBaseUrl(configuredEndpoints.tickets, `http://${host}:3002/tickets`),
  notifications: normalizeBaseUrl(configuredEndpoints.notifications, `http://${host}:3003/notifications`),
  gateway: normalizeBaseUrl(configuredEndpoints.gateway, `http://${host}:3008/gateway`),
};

const endpoints = {
  users: `${serviceBases.users}/data`,
  events: `${serviceBases.events}/data`,
  tickets: `${serviceBases.tickets}/data`,
  notifications: `${serviceBases.notifications}/data`,
  gatewayHealth: `${serviceBases.gateway}/health`,
};

function updateGatewayStatus(text, kind) {
  const el = document.getElementById('gatewayStatus');
  if (!el) {
    return;
  }

  el.textContent = text;
  el.className = `status-pill ${kind || ''}`.trim();
}

function updateDeploymentMode() {
  const el = document.getElementById('deploymentMode');
  if (!el) {
    return;
  }

  el.textContent = deployment === 'vercel-render'
    ? 'Frontend en Vercel con rutas unificadas hacia servicios en Render'
    : 'Modo local directo por puertos hacia los microservicios';
}

async function loadGatewayHealth() {
  try {
    const payload = await request(endpoints.gatewayHealth);
    const serviceName = payload?.service || 'api-gateway';
    updateGatewayStatus(`${serviceName} activo`, 'ok');
  } catch (error) {
    updateGatewayStatus('Gateway sin respuesta', 'err');
    throw error;
  }
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function renderList(id, items, formatter, removeAction) {
  const ul = document.getElementById(id);
  ul.innerHTML = '';
  items.forEach((item) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = formatter(item);

    const btn = document.createElement('button');
    btn.className = 'del';
    btn.textContent = 'Eliminar';
    btn.addEventListener('click', async () => {
      await removeAction(item.id);
    });

    li.appendChild(span);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

async function loadUsers() {
  const users = await request(endpoints.users);
  renderList(
    'usersList',
    users,
    (u) => `${u.name} | ${u.email}`,
    async (id) => {
      await request(`${endpoints.users}/${id}`, { method: 'DELETE' });
      toast('Usuario eliminado');
      await loadUsers();
    },
  );
}

async function loadEvents() {
  const events = await request(endpoints.events);
  renderList(
    'eventsList',
    events,
    (e) => `${e.title} | ${new Date(e.date).toLocaleDateString()} | ${e.location}`,
    async (id) => {
      await request(`${endpoints.events}/${id}`, { method: 'DELETE' });
      toast('Evento eliminado');
      await loadEvents();
    },
  );
}

async function loadTickets() {
  const tickets = await request(endpoints.tickets);
  renderList(
    'ticketsList',
    tickets,
    (t) => `${t.title} | ${t.status}`,
    async (id) => {
      await request(`${endpoints.tickets}/${id}`, { method: 'DELETE' });
      toast('Ticket eliminado');
      await loadTickets();
    },
  );
}

async function loadNotifications() {
  const notifications = await request(endpoints.notifications);
  renderList(
    'notificationsList',
    notifications,
    (n) => `${n.message} | ${n.recipient}`,
    async (id) => {
      await request(`${endpoints.notifications}/${id}`, { method: 'DELETE' });
      toast('Notificacion eliminada');
      await loadNotifications();
    },
  );
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await request(endpoints.users, {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('userName').value,
      email: document.getElementById('userEmail').value,
      password: document.getElementById('userPassword').value,
    }),
  });
  e.target.reset();
  toast('Usuario creado');
  await loadUsers();
});

document.getElementById('eventForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await request(endpoints.events, {
    method: 'POST',
    body: JSON.stringify({
      title: document.getElementById('eventTitle').value,
      date: document.getElementById('eventDate').value,
      location: document.getElementById('eventLocation').value,
    }),
  });
  e.target.reset();
  toast('Evento creado');
  await loadEvents();
});

document.getElementById('ticketForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await request(endpoints.tickets, {
    method: 'POST',
    body: JSON.stringify({
      title: document.getElementById('ticketTitle').value,
      description: document.getElementById('ticketDescription').value,
      status: document.getElementById('ticketStatus').value,
    }),
  });
  e.target.reset();
  toast('Ticket creado');
  await loadTickets();
});

document.getElementById('notificationForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  await request(endpoints.notifications, {
    method: 'POST',
    body: JSON.stringify({
      message: document.getElementById('notificationMessage').value,
      recipient: document.getElementById('notificationRecipient').value,
      read: false,
    }),
  });
  e.target.reset();
  toast('Notificacion creada');
  await loadNotifications();
});

document.getElementById('loadUsers').addEventListener('click', loadUsers);
document.getElementById('loadEvents').addEventListener('click', loadEvents);
document.getElementById('loadTickets').addEventListener('click', loadTickets);
document.getElementById('loadNotifications').addEventListener('click', loadNotifications);

async function initialize() {
  const gatewayLink = document.getElementById('openGateway');
  if (gatewayLink) {
    gatewayLink.href = config.gatewayUiUrl || serviceBases.gateway;
  }

  updateDeploymentMode();

  try {
    await loadGatewayHealth();
    await Promise.all([loadUsers(), loadEvents(), loadTickets(), loadNotifications()]);
    toast(
      deployment === 'vercel-render'
        ? 'Panel conectado por Vercel hacia Render'
        : 'Panel conectado a microservicios locales',
    );
  } catch (error) {
    toast(`Error de conexion: ${error.message}`);
  }
}

initialize();
