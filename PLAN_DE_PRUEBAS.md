# Plan de Pruebas de Software

Proyecto: **EventHive** — plataforma de eventos basada en microservicios NestJS.

## 1. Alcance

El plan cubre **pruebas unitarias automatizadas** sobre los 7 microservicios del backend. Cada servicio se prueba de forma aislada usando **Jest + ts-jest**, instanciando los controllers/services con dependencias *mockeadas* (TypeORM repositories, RabbitMQ, fetch a otros servicios). No se requiere base de datos, RabbitMQ ni red para ejecutar la batería.

Lo que **sí** se cubre:
- Health checks (`/health`) de cada servicio.
- Validación de entrada y normalización de filtros en los controllers.
- Reglas de autorización por rol (`standard` vs `admin`) y por owner (un usuario no puede leer datos de otro).
- Invariantes de negocio críticas (ej. check-in atómico de QR, race conditions, scanners en allowlist).
- Mapeo de identidad del JWT (`req.user.sub`, `req.user.email`) a los DTOs que reciben los services.
- Comportamiento ante upstreams caídos (degradación elegante en el BFF).

Lo que **no** se cubre en esta iteración (posibles próximas fases):
- Pruebas E2E reales (con base de datos efímera + supertest contra el servidor en vivo).
- Pruebas de carga / estrés.
- Pruebas de seguridad activas (fuzzing, OWASP ZAP).
- Frontend (HTML/JS embebido en los controllers).

## 2. Criterios de aceptación

| Criterio | Umbral mínimo |
|---|---|
| Tests verdes en CI local | 100% pasa con `npm test` por servicio |
| Cobertura de los métodos públicos del controller | >= 80% líneas |
| Cero side-effects de red/DB durante los tests | Verificado con mocks inyectados |
| Tiempo de ejecución por servicio | < 30s en local |

## 3. Estructura de la batería

```
microservices/
├── agenda-service/
│   └── src/agenda.controller.spec.ts          (NUEVO)
├── analytics-service/
│   └── src/analytics.controller.spec.ts       (NUEVO)
├── credential-service/
│   ├── src/credential.controller.spec.ts      (NUEVO)
│   └── src/credential.service.spec.ts         (NUEVO — flujo crítico de check-in QR)
├── event-service/
│   └── src/app.controller.spec.ts             (existente)
├── mobile-api-service/
│   └── src/mobile.controller.spec.ts          (NUEVO)
├── notification-service/
│   └── src/notification.controller.spec.ts    (existente)
├── ticketing-service/
│   └── src/ticket.controller.spec.ts          (existente)
└── user-service/
    └── src/user/{user.controller,user.service}.spec.ts (existentes)
```

## 4. Cómo ejecutar

Por servicio, desde la raíz de su carpeta:

```bash
cd microservices/<servicio>
npm install         # solo la primera vez (jest, ts-jest, etc.)
npm test            # corre toda la batería del servicio
```

Para correr los 4 servicios nuevos en una sola pasada (PowerShell):

```powershell
$services = @('agenda-service','analytics-service','credential-service','mobile-api-service')
foreach ($s in $services) {
  Push-Location "microservices/$s"
  npm test
  Pop-Location
}
```

## 5. Casos de prueba implementados

### 5.1 mobile-api-service
| Caso | Tipo | Resultado esperado |
|---|---|---|
| `GET /mobile/health` | Funcional | `{ service: 'mobile-api-service', status: 'ok' }` |
| Render del shell HTML | Funcional | Contiene `Mobile API Service (BFF)` |
| Usuario `standard` consulta dashboard ajeno | Autorización | Lanza `ForbiddenException` |
| Sin role explícito y sin coincidencia de IDs | Autorización | Lanza `ForbiddenException` |
| Agregación de upstreams para usuario propio | Integración mock | Suma totales de events/tickets/notifications/agenda |
| Admin consulta dashboard ajeno con upstreams degradados | Resiliencia | Devuelve fallback `0` por servicio caído |

### 5.2 agenda-service
| Caso | Tipo | Resultado esperado |
|---|---|---|
| `GET /agenda/health` | Funcional | OK |
| Renderiza UI HTML | Funcional | Contiene `Agenda Service` |
| Forwardea filtros + Authorization a `getCalendarData` | Funcional | Llamada con argumentos exactos |
| Parsea fechas string a `Date` al crear sesión | Validación | `startTime`/`endTime` son `Date` |
| Convierte `limit` string a number | Validación | `listSessions(25)` |
| `standard` agrega favorito sólo para sí mismo | Autorización | Ignora `userId` ajeno enviado en body |
| `admin` agrega favorito para cualquier usuario | Autorización | Honra el `userId` solicitado |
| Sin requester ni target user válido | Autorización | `ForbiddenException` |
| `standard` consulta favoritos de otro usuario | Autorización | `ForbiddenException` |
| `admin` consulta summary de otro usuario | Autorización | OK |

### 5.3 analytics-service
| Caso | Tipo | Resultado esperado |
|---|---|---|
| `GET /analytics/health` | Funcional | OK |
| Renderiza UI HTML | Funcional | Contiene `Analitica de ventas` |
| Ingesta de compras se delega al service | Funcional | Argumentos exactos |
| Mapea `req.user.sub`/`email` a organizerId/Email | Identidad | DTO correcto |
| Parsea limit string y forwardea filtros | Validación | DTO correcto |
| Sin limit usa default 30 | Validación | `limit: 30` |

### 5.4 credential-service (controller)
| Caso | Tipo | Resultado esperado |
|---|---|---|
| Renderiza landing con links a client/staff | Funcional | OK |
| Devuelve scanner context | Funcional | OK |
| `GET /credentials/health` | Funcional | OK |
| Forwardea Authorization en `myCredentials` | Funcional | OK |
| Sin Authorization usa cadena vacía | Defensivo | OK |
| Rechaza `ticket-purchased` sin header `x-forwarded-by: ticketing-service` | **Seguridad** | `ForbiddenException` |
| Acepta `ticket-purchased` con header correcto (case-insensitive) | Seguridad | Procesa el evento |
| Delega validación QR | Funcional | Args exactos |
| Default revoker `admin-panel` cuando no se especifica | Funcional | OK |
| Honra revoker explícito | Funcional | OK |
| Devuelve total de credenciales | Funcional | OK |
| Parsea limit en repair y findAll | Validación | OK |

### 5.5 credential-service (service — flujo crítico de QR)
| Caso | Tipo | Resultado esperado |
|---|---|---|
| QR vacío | Validación | `{ valid: false, status: 'INVALID', reason: 'QR no especificado' }` |
| Scanner vacío | Validación | INVALID |
| Scanner fuera de allowlist `SCANNER_IDS` | **Seguridad** | INVALID — `Scanner no autorizado` |
| Credencial inexistente | Funcional | INVALID |
| Credencial ya usada | Anti-reuso | USED — sin mutar |
| Credencial revocada | Funcional | REVOKED |
| Check-in exitoso atómico | **Concurrencia** | `update` con WHERE `isUsed=false`, publica evento `checkin.processed` |
| Race condition: otro scanner tomó el QR primero | **Concurrencia** | `affected=0` → devuelve USED sin emitir evento |
| Scanner context sin SCANNER_IDS → no restringido | Configuración | OK |
| Scanner context con allowlist y request inválido | Seguridad | Override al primer scanner permitido |
| Scanner context con allowlist y request válido | Seguridad | Conserva el solicitado |

## 6. Riesgos identificados

1. **Validación QR es el punto crítico de seguridad.** Una regresión en `validateQr` (ej. olvidar la cláusula `isUsed: false` en el update) permitiría reusar tickets. Los tests de race condition lo cubren.
2. **Authorization por owner vs admin** está duplicada en agenda y mobile (lógica casi idéntica). Si se refactoriza a un guard común, hay que mantener los tests que verifican el comportamiento end-to-end.
3. **Los tests no validan TypeORM real** — un cambio en el schema de la entity Credential que rompa la persistencia no será detectado hasta despliegue. Mitigación: añadir tests E2E en una próxima fase.

## 7. Cronograma sugerido

| Fase | Entregable | Estado |
|---|---|---|
| Fase 1 (esta) | Specs unitarias para los 4 servicios sin cobertura + plan documentado | **Hecho** |
| Fase 2 | Specs adicionales para `ticket.service`, `payment.service`, `mercadopago.service` (sin cobertura aún) | Pendiente |
| Fase 3 | Tests E2E con DB efímera (testcontainers) y supertest contra rutas reales | Pendiente |
| Fase 4 | CI: workflow `.github/workflows/test.yml` que ejecute los tests por servicio en cada PR | Pendiente |
