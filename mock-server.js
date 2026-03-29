const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

const proxyTargets = {
  users: 'http://localhost:3000',
  events: 'http://localhost:3001',
  tickets: 'http://localhost:3002',
  notifications: 'http://localhost:3003',
  credentials: 'http://localhost:3004',
  agenda: 'http://localhost:3005',
  analytics: 'http://localhost:3006',
  mobile: 'http://localhost:3007',
  gateway: 'http://localhost:3008',
};

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function extractProxyHeaders(headers) {
  const outgoing = {};

  Object.entries(headers || {}).forEach(([key, value]) => {
    if (typeof value === 'undefined' || hopByHopHeaders.has(key.toLowerCase())) {
      return;
    }

    outgoing[key] = Array.isArray(value) ? value.join(', ') : value;
  });

  return outgoing;
}

app.use(async (req, res, next) => {
  const pathParts = req.path.split('/').filter(Boolean);
  const serviceKey = pathParts[0];

  if (!serviceKey || !Object.prototype.hasOwnProperty.call(proxyTargets, serviceKey)) {
    return next();
  }

  const targetUrl = new URL(req.originalUrl, proxyTargets[serviceKey]);
  const requestInit = {
    method: req.method,
    headers: extractProxyHeaders(req.headers),
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(req.method || 'GET') && typeof req.body !== 'undefined' && Object.keys(req.body || {}).length > 0) {
    requestInit.body = JSON.stringify(req.body);
    if (!requestInit.headers['content-type']) {
      requestInit.headers['content-type'] = 'application/json';
    }
  }

  try {
    const upstream = await fetch(targetUrl, requestInit);
    res.status(upstream.status);

    upstream.headers.forEach((value, key) => {
      if (hopByHopHeaders.has(key.toLowerCase())) {
        return;
      }

      res.setHeader(key, value);
    });

    const payload = Buffer.from(await upstream.arrayBuffer());
    return res.send(payload);
  } catch (error) {
    return res.status(502).json({
      message: `No se pudo contactar el servicio ${serviceKey}`,
      reason: error instanceof Error ? error.message : 'Error desconocido',
    });
  }
});

// Mock data
const mockUsers = [];
const mockEvents = [];
const mockTickets = [];
const mockNotifications = [];
const mockCredentials = [];
const mockAgenda = [];
const mockAnalytics = [];

// ============= SERVICES MOCK =============

// User Service (3000)
const userApp = express();
userApp.use(express.json());
userApp.get('/', (req, res) => res.send(renderHTML('User Service - 3000')));
userApp.get('/users', (req, res) => res.json(mockUsers));
userApp.post('/users', (req, res) => {
  const user = { id: mockUsers.length + 1, ...req.body, createdAt: new Date() };
  mockUsers.push(user);
  res.status(201).json(user);
});
userApp.get('/metrics', (req, res) => res.send('# HELP users_total Total users\n# TYPE users_total gauge\nusers_total ' + mockUsers.length));
userApp.listen(3000, '0.0.0.0', () => console.log('✅ User Service (3000)'));

// Event Service (3001)
const eventApp = express();
eventApp.use(express.json());
eventApp.get('/', (req, res) => res.send(renderHTML('Event Service - 3001')));
eventApp.get('/events', (req, res) => res.json(mockEvents));
eventApp.post('/events', (req, res) => {
  const event = { id: mockEvents.length + 1, ...req.body, createdAt: new Date() };
  mockEvents.push(event);
  res.status(201).json(event);
});
eventApp.get('/metrics', (req, res) => res.send('# HELP events_total Total events\n# TYPE events_total gauge\nevents_total ' + mockEvents.length));
eventApp.listen(3001, '0.0.0.0', () => console.log('✅ Event Service (3001)'));

// Ticketing Service (3002)
const ticketApp = express();
ticketApp.use(express.json());
ticketApp.get('/', (req, res) => res.send(renderHTML('Ticketing Service - 3002')));
ticketApp.get('/tickets', (req, res) => res.json(mockTickets));
ticketApp.post('/tickets', (req, res) => {
  const ticket = { id: mockTickets.length + 1, ...req.body, createdAt: new Date() };
  mockTickets.push(ticket);
  res.status(201).json(ticket);
});
ticketApp.post('/payments', (req, res) => {
  res.json({ status: 'success', paymentId: 'PM_' + Date.now() });
});
ticketApp.get('/metrics', (req, res) => res.send('# HELP tickets_total Total tickets\n# TYPE tickets_total gauge\ntickets_total ' + mockTickets.length));
ticketApp.listen(3002, '0.0.0.0', () => console.log('✅ Ticketing Service (3002)'));

// Notification Service (3003)
const notifApp = express();
notifApp.use(express.json());
notifApp.get('/', (req, res) => res.send(renderHTML('Notification Service - 3003')));
notifApp.get('/notifications', (req, res) => res.json(mockNotifications));
notifApp.post('/notifications', (req, res) => {
  const notif = { id: mockNotifications.length + 1, ...req.body, createdAt: new Date() };
  mockNotifications.push(notif);
  res.status(201).json(notif);
});
notifApp.get('/metrics', (req, res) => res.send('# HELP notifications_total Total notifications\n# TYPE notifications_total gauge\nnotifications_total ' + mockNotifications.length));
notifApp.listen(3003, '0.0.0.0', () => console.log('✅ Notification Service (3003)'));

// Credential Service (3004)
const credApp = express();
credApp.use(express.json());
credApp.get('/', (req, res) => res.send(renderHTML('Credential Service - 3004')));
credApp.get('/credentials', (req, res) => res.json(mockCredentials));
credApp.post('/credentials', (req, res) => {
  const cred = { id: mockCredentials.length + 1, ...req.body, qr: 'QR_' + Date.now(), createdAt: new Date() };
  mockCredentials.push(cred);
  res.status(201).json(cred);
});
credApp.get('/metrics', (req, res) => res.send('# HELP credentials_total Total credentials\n# TYPE credentials_total gauge\ncredentials_total ' + mockCredentials.length));
credApp.listen(3004, '0.0.0.0', () => console.log('✅ Credential Service (3004)'));

// Agenda Service (3005)
const agendaApp = express();
agendaApp.use(express.json());
agendaApp.get('/', (req, res) => res.send(renderHTML('Agenda Service - 3005')));
agendaApp.get('/sessions', (req, res) => res.json(mockAgenda));
agendaApp.post('/sessions', (req, res) => {
  const session = { id: mockAgenda.length + 1, ...req.body, createdAt: new Date() };
  mockAgenda.push(session);
  res.status(201).json(session);
});
agendaApp.get('/metrics', (req, res) => res.send('# HELP sessions_total Total sessions\n# TYPE sessions_total gauge\nsessions_total ' + mockAgenda.length));
agendaApp.listen(3005, '0.0.0.0', () => console.log('✅ Agenda Service (3005)'));

// Analytics Service (3006)
const analyticsApp = express();
analyticsApp.use(express.json());
analyticsApp.get('/', (req, res) => res.send(renderHTML('Analytics Service - 3006')));
analyticsApp.get('/analytics', (req, res) => res.json({
  totalUsers: mockUsers.length,
  totalEvents: mockEvents.length,
  totalTickets: mockTickets.length,
  revenue: mockTickets.length * 50
}));
analyticsApp.get('/metrics', (req, res) => res.send('# HELP revenue_total Total revenue\n# TYPE revenue_total gauge\nrevenue_total ' + (mockTickets.length * 50)));
analyticsApp.listen(3006, '0.0.0.0', () => console.log('✅ Analytics Service (3006)'));

// Mobile API Service (3007)
const mobileApp = express();
mobileApp.use(express.json());
mobileApp.get('/', (req, res) => res.send(renderHTML('Mobile API Service - 3007')));
mobileApp.get('/dashboard', (req, res) => res.json({
  users: mockUsers,
  events: mockEvents,
  tickets: mockTickets
}));
mobileApp.get('/metrics', (req, res) => res.send('# HELP api_calls_total Total API calls\n# TYPE api_calls_total gauge\napi_calls_total 100'));
mobileApp.listen(3007, '0.0.0.0', () => console.log('✅ Mobile API Service (3007)'));

// API Gateway (3008)
const gatewayApp = express();
gatewayApp.use(express.json());
gatewayApp.use(express.static(path.join(__dirname, 'frontend')));
gatewayApp.get('/', (req, res) => res.sendFile(path.join(__dirname, 'frontend', 'index.html')));
gatewayApp.get('/api/users', (req, res) => res.json(mockUsers));
gatewayApp.get('/api/events', (req, res) => res.json(mockEvents));
gatewayApp.get('/api/tickets', (req, res) => res.json(mockTickets));
gatewayApp.post('/api/users', (req, res) => {
  const user = { id: mockUsers.length + 1, ...req.body, createdAt: new Date() };
  mockUsers.push(user);
  res.status(201).json(user);
});
gatewayApp.post('/api/events', (req, res) => {
  const event = { id: mockEvents.length + 1, ...req.body, createdAt: new Date() };
  mockEvents.push(event);
  res.status(201).json(event);
});
gatewayApp.post('/api/tickets', (req, res) => {
  const ticket = { id: mockTickets.length + 1, ...req.body, createdAt: new Date() };
  mockTickets.push(ticket);
  res.status(201).json(ticket);
});
gatewayApp.get('/metrics', (req, res) => res.send('# HELP gateway_calls_total Total gateway calls\n# TYPE gateway_calls_total gauge\ngateway_calls_total 200'));
gatewayApp.listen(3008, '0.0.0.0', () => console.log('✅ API Gateway (3008)'));

// Frontend on port 3009
app.listen(3009, '0.0.0.0', () => console.log('🌐 Frontend - http://localhost:3009'));

function renderHTML(title) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        body { font-family: Arial; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; }
        h1 { color: #333; text-align: center; }
        .status { background: #4CAF50; color: white; padding: 10px; border-radius: 5px; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>${title}</h1>
        <div class="status">✅ Servicio activo y respondiendo</div>
        <p style="text-align: center; margin-top: 20px;">
          <a href="http://localhost:3009" style="color: #667eea; text-decoration: none;">← Volver al panel principal</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

console.log('\n🚀 Mock Microservices Server iniciado!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 Servicios disponibles:');
console.log('  • User Service: http://localhost:3000');
console.log('  • Event Service: http://localhost:3001');
console.log('  • Ticketing Service: http://localhost:3002');
console.log('  • Notification Service: http://localhost:3003');
console.log('  • Credential Service: http://localhost:3004');
console.log('  • Agenda Service: http://localhost:3005');
console.log('  • Analytics Service: http://localhost:3006');
console.log('  • Mobile API Service: http://localhost:3007');
console.log('  • API Gateway: http://localhost:3008');
console.log('  • Frontend Panel: http://localhost:3009 ⭐');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
