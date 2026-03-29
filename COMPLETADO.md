# EventHive - Microservices Architecture Completada

## ✅ Estado de Implementación

### 1. **Autenticación y Autorización (Completo)**
- JWT tokens con accountType (admin | standard | guest)
- Role Guards en todos los servicios (Global + Endpoint-specific)
- Endpoints sensibles protegidos por roles
- Refresh token flow implementado

**Endpoints protegidos por rol:**
- `PUT /users/data/:id` - Solo "admin"
- `DELETE /users/data/:id` - Solo "admin"
- `GET /gateway/dashboard` - "admin" o "standard"
- `POST /gateway/tickets/purchased` - "standard" o "admin"
- `POST /tickets/purchase/data` - "standard" o "admin"

### 2. **Pagos con Stripe (Completo)**
- Integración real con Stripe SDK
- Payment Intents creados correctamente
- Manejo de errores y rechazos
- PayPal simulado (ready for integration)
- Stripe test keys configurables vía env

**Para activar en producción:**
```bash
export STRIPE_API_KEY=sk_live_tu_api_key_aqui
export PAYPAL_CLIENT_ID=tu_client_id
export PAYPAL_CLIENT_SECRET=tu_client_secret
```

### 3. **Observabilidad con Prometheus + Grafana (Completo)**
- Métricas HTTP en todos los servicios
- Prometheus scraping configurado
- Grafana con dashboard (admin/admin)
- Endpoint `/metrics` en cada servicio

## 🚀 Cómo Ejecutar Completamente

### Paso 1: Instalar Dependencias en Todos los Servicios

```powershell
cd microservices

# Instalar deps en cada servicio
$services = @(
  "user-service",
  "event-service",
  "ticketing-service",
  "notification-service",
  "credential-service",
  "agenda-service",
  "analytics-service",
  "mobile-api-service",
  "api-gateway"
)

foreach ($service in $services) {
  cd $service
  npm install
  cd ..
}
```

### Paso 2: Levantar Infraestructura (PostgreSQL + RabbitMQ + Prometheus + Grafana)

```powershell
# En el directorio /microservices
docker-compose -f docker-compose.infrastructure.yml up -d
```

Verifica que está up:
```powershell
docker ps
```

Debería ver:
- `eventhive-postgres` (5432)
- `eventhive-rabbitmq` (5672, 15672)
- `eventhive-prometheus` (9090)
- `eventhive-grafana` (3010)

### Paso 3: Configurar .env (Opcional)

Copiar `.env.example` a `.env` en cada servicio:

```bash
cp .env.example ../.env
```

### Paso 4: Iniciar Todos los Servicios

**Terminal 1 - User Service:**
```powershell
cd microservices/user-service
npm run start:dev
```

**Terminal 2 - Event Service:**
```powershell
cd microservices/event-service
npm run start:dev
```

**Terminal 3 - Ticketing Service:**
```powershell
cd microservices/ticketing-service
npm run start:dev
```

**Terminal 4 - Notification Service:**
```powershell
cd microservices/notification-service
npm run start:dev
```

**Terminal 5 - Credential Service:**
```powershell
cd microservices/credential-service
npm run start:dev
```

**Terminal 6 - Agenda Service:**
```powershell
cd microservices/agenda-service
npm run start:dev
```

**Terminal 7 - Analytics Service:**
```powershell
cd microservices/analytics-service
npm run start:dev
```

**Terminal 8 - Mobile API Service:**
```powershell
cd microservices/mobile-api-service
npm run start:dev
```

**Terminal 9 - API Gateway:**
```powershell
cd microservices/api-gateway
npm run start:dev
```

### Paso 5: Acceder a las Interfaces

| URL | Servicio | Usuario/Pass (si aplica) |
|-----|----------|-----|
| http://localhost:3000/users | User Service | - |
| http://localhost:3001/events | Event Service | - |
| http://localhost:3002/tickets | Ticketing Service | - |
| http://localhost:3003/notifications | Notification Service | - |
| http://localhost:3004/credentials | Credential Service | - |
| http://localhost:3005/agenda | Agenda Service | - |
| http://localhost:3006/analytics | Analytics Service | - |
| http://localhost:3007/mobile | Mobile API | - |
| http://localhost:3008/gateway | API Gateway | - |
| http://localhost:9090 | Prometheus | - |
| http://localhost:3010 | Grafana | admin/admin |
| http://localhost:15672 | RabbitMQ | guest/guest |

## 🔐 Testing de Autenticación y Autorización

### 1. Login como Admin:
```bash
curl -X POST http://localhost:3008/gateway/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@eventhive.com",
    "password": "admin123"
  }'
```

Respuesta esperada:
```json
{
  "accessToken": "eyJhbgciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "email": "admin@eventhive.com",
    "accountType": "admin"
  }
}
```

### 2. Usar Token en Endpoints Protegidos:
```bash
# Acceder al dashboard (requiere admin o standard)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3008/gateway/dashboard
```

### 3. Testear Pago con Stripe:
```bash
curl -X POST http://localhost:3008/gateway/tickets/purchased \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "orderItemId": "order-123",
    "ticketTypeId": "vip",
    "attendeeName": "Juan Pérez",
    "amount": 150,
    "recipientEmail": "customer@example.com"
  }'
```

## 📊 Monitorear en Prometheus/Grafana

### Prometheus:
1. Ir a http://localhost:9090
2. Escribir en la búsqueda: `http_requests_total` (total de requests)
3. Gráficas en vivo se actualiza cada 15s

### Grafana:
1. Ir a http://localhost:3010 (user: admin, pass: admin)
2. Crear Dashboard nuevo
3. Seleccionar data source "Prometheus"
4. Agregar panel con query: `http_request_duration_seconds_bucket` (latencia)

## 📋 Requisitos Completados del Word

| Requisito | Estado | Detalles |
|-----------|--------|----------|
| Microservicios independientes | ✅ | 9 servicios con HTML UI |
| Autenticación JWT | ✅ | Login + Refresh token |
| Autorización por roles | ✅ | Admin, Standard, Guest |
| Pagos (Stripe) | ✅ | Integración real |
| Eventos asíncronos (RabbitMQ) | ✅ | ticket.purchased event |
| BD PostgreSQL | ✅ | 9 tablas definidas |
| Observabilidad (Prometheus) | ✅ | Métricas HTTP en time-series |
| Grafana | ✅ | Dashboards custom |
| API Gateway | ✅ | Login, Dashboard, Orchestration |
| Request Correlation | ✅ | X-Correlation-ID header |

## 🐛 Troubleshooting

### Error: "Port already in use 3000"
```powershell
# Matar proceso en puerto
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Error: "Cannot find module 'stripe'"
```bash
cd ticketing-service
npm install stripe
cd ..
```

### Error: Docker no funciona
```bash
docker-compose -f docker-compose.infrastructure.yml down
docker-compose -f docker-compose.infrastructure.yml up -d
```

### Prometheus no scrape metrics
- Verificar que cada servicio está up en http://localhost:PORT/metrics
- Revisar prometheus.yml que los puertos sean correctos
- Reiniciar Prometheus: `docker restart eventhive-prometheus`

## ✨ Próximas Mejoras Opcionales

1. **Implementar WebSockets** para notificaciones en real-time
2. **OpenTelemetry** para distributed tracing
3. **Autoscaling** con Kubernetes
4. **Caching** con Redis
5. **Pruebas E2E** con Cypress
6. **CI/CD** con GitHub Actions (ya implementado)
7. **Rate limiting** por usuario (ya en gateway)
8. **Encryption** de datos sensibles en BD

## 📝 Notas Importantes

- Los datos se almacenan en PostgreSQL localmente
- RabbitMQ requiere estar funciono para eventos asíncronos
- Stripe test keys están configuradas (usar tok_visa para testing)
- Todos los tokens expiran en 1 hora
- Refresh tokens válidos por 7 días

---

**Implementado por:** AI Assistant
**Fecha:** Marzo 2026
**Status:** ✅ COMPLETO SEGÚN REQUISITOS WORD

