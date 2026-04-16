# EventHive Microservices

EventHive es una plataforma de gestion de eventos compuesta por microservicios NestJS y un frontend web que consume todo el sistema a traves de un API Gateway. El proyecto cubre autenticacion, gestion de eventos, ticketing, credenciales QR, notificaciones, agenda, analitica y una API orientada a clientes moviles.

## Que hace el proyecto

- Permite registrar usuarios participantes y organizadores.
- Centraliza el acceso HTTP por medio de `api-gateway`.
- Gestiona eventos, tickets y compras.
- Genera credenciales QR y valida accesos en puerta.
- Expone agenda, notificaciones y metricas de negocio.
- Incluye un frontend local que embebe varios microservicios dentro de una sola interfaz.

## Arquitectura

### Frontend y entrada unica

- Frontend local: `http://localhost:3009`
- API Gateway: `http://localhost:3008`
- El frontend usa proxy same-origin hacia `/gateway`, `/users`, `/events`, `/tickets`, `/notifications`, `/credentials`, `/analytics`, `/agenda` y `/mobile`.

### Microservicios

| Servicio | Puerto | Responsabilidad |
| --- | --- | --- |
| `user-service` | `3000` | autenticacion, usuarios, JWT, refresh token, recuperacion de contrasena |
| `event-service` | `3001` | CRUD de eventos, UI embebida de eventos y resumen operativo |
| `ticketing-service` | `3002` | tipos de ticket, ordenes, compra, vistas cliente/organizador |
| `notification-service` | `3003` | notificaciones y campanas por ticket, integracion email |
| `credential-service` | `3004` | credenciales QR para asistentes y validacion en puerta |
| `agenda-service` | `3005` | agenda y calendario consolidados para la experiencia de usuario |
| `analytics-service` | `3006` | metricas de ventas y resumenes por dia y tipo de ticket |
| `mobile-api-service` | `3007` | endpoints orientados a consumo movil |
| `api-gateway` | `3008` | proxy y entrada unificada a los microservicios |

### Infraestructura local

- PostgreSQL 16 en `localhost:5432`
- RabbitMQ en `localhost:5672`
- Prometheus en `localhost:9090`
- Grafana en `localhost:3010`

La infraestructura se define en [microservices/docker-compose.infrastructure.yml](microservices/docker-compose.infrastructure.yml).

## Stack tecnico

- NestJS 11
- TypeScript
- TypeORM 0.3
- PostgreSQL
- RabbitMQ
- Jest + supertest
- Frontend HTML/CSS/JS servido por Node HTTP
- Vercel + Render para despliegue

## Estructura del repositorio

```text
frontend/          Frontend shell, assets, vistas y proxy local
microservices/     Todos los microservicios NestJS + infraestructura local
render.yaml        Definicion de despliegue para Render
package.json       Script raiz para levantar el frontend local
```

## Requisitos

- Node.js 20+ recomendado
- npm
- Docker Desktop si quieres levantar PostgreSQL/RabbitMQ/Prometheus/Grafana con Compose

## Configuracion

La configuracion base vive en [microservices/.env.example](microservices/.env.example).

Variables importantes:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_SYNCHRONIZE`
- `JWT_SECRET`
- `RABBITMQ_URL`
- `USER_SERVICE_URL`, `EVENT_SERVICE_URL`, `TICKETING_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `CREDENTIAL_SERVICE_URL`, `AGENDA_SERVICE_URL`, `ANALYTICS_SERVICE_URL`, `MOBILE_SERVICE_URL`
- `GATEWAY_BASE_URL` para el frontend local si no usas `http://localhost:3008`

Para entorno local suele bastar con crear `microservices/.env` a partir del ejemplo.

## Como ejecutar el proyecto

### 1. Instalar dependencias

Instala dependencias en la raiz y en cada microservicio:

```bash
npm install

cd microservices/user-service && npm install
cd ../event-service && npm install
cd ../ticketing-service && npm install
cd ../notification-service && npm install
cd ../credential-service && npm install
cd ../agenda-service && npm install
cd ../analytics-service && npm install
cd ../mobile-api-service && npm install
cd ../api-gateway && npm install
```

### 2. Levantar infraestructura

Desde la carpeta `microservices/`:

```bash
docker compose -f docker-compose.infrastructure.yml up -d
```

Si RabbitMQ no esta disponible, varios servicios degradan de forma controlada, pero algunas funciones asincronas no estaran activas.

### 3. Levantar todo el stack local desde la raiz

Desde la raiz del repositorio puedes arrancar el frontend y todos los microservicios principales con un solo comando:

```bash
npm run start:local
```

El comando tambien esta expuesto como:

```bash
npm run start:frontend
```

Si algun puerto ya esta ocupado, el lanzador lo detecta y no vuelve a iniciar ese servicio.

### 4. Levantar solo el frontend local

Si ya tienes los microservicios corriendo por separado y solo quieres levantar el shell web:

```bash
npm run start:frontend:only
```

Abre:

```text
http://localhost:3009
```

## Flujo local recomendado

1. Levanta PostgreSQL y RabbitMQ.
2. Arranca todo con `npm run start:local` desde la raiz.
3. Si solo necesitas la UI, usa `npm run start:frontend:only` y deja los microservicios en terminales separadas.
4. Verifica salud via gateway o directamente por servicio.

## Endpoints de salud

- `GET /users/health`
- `GET /events/health`
- `GET /tickets/health`
- `GET /notifications/health`
- `GET /credentials/health`
- `GET /agenda/health`
- `GET /analytics/health`
- `GET /mobile/health`
- `GET /gateway/health`

En local, los endpoints completos quedan en `http://localhost:3000..3008` segun el servicio.

## Pruebas

Servicios con cobertura de pruebas relevante en el estado actual del repo:

- `user-service`: unitarias y e2e
- `event-service`: unitarias y e2e
- `ticketing-service`: unitarias y e2e
- `notification-service`: unitarias y e2e

Ejemplos:

```bash
cd microservices/user-service && npm test
cd microservices/user-service && npm run test:e2e

cd microservices/event-service && npm test
cd microservices/ticketing-service && npm test
cd microservices/notification-service && npm run test:e2e
```

## Comportamiento por rol en la interfaz

- Participante: puede explorar eventos, comprar tickets, ver credenciales y agenda.
- Organizador: puede gestionar eventos, ver analitica, acceder a paneles de operacion y validar credenciales en puerta.
- El shell frontend ya adapta ciertas vistas embebidas por rol, por ejemplo:
  - Eventos en solo lectura para participantes.
  - Ticketing en modo cliente u organizador segun el rol.
  - Credenciales en vista cliente o staff segun el rol.

## Observabilidad

Los microservicios exponen `/metrics` para Prometheus y el stack local incluye:

- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3010`

## Despliegue

- `render.yaml` contiene la definicion de despliegue de servicios en Render.
- `frontend/vercel.json` contiene la configuracion de rewrites/proxy para Vercel.
- En produccion el acceso publico debe entrar por `api-gateway`.

## Notas utiles

- El sistema comparte una sola base de datos PostgreSQL en desarrollo.
- `analytics-service` ya no depende de `synchronize`; valida y migra su esquema al arrancar.
- Si se configura `INTERNAL_API_KEY`, los accesos directos a microservicios quedan restringidos y el trafico debe pasar por el gateway o reenviar esa cabecera.
- `notification-service`, `credential-service`, `ticketing-service` y `analytics-service` degradan parcialmente si RabbitMQ no esta disponible.

## Documentacion adicional

- [DEPLOY_VERCEL_RENDER.md](DEPLOY_VERCEL_RENDER.md)
- [ACCESO_RED.md](ACCESO_RED.md)
- [COMPLETADO.md](COMPLETADO.md)
- [CUMPLE_COMPLETO.md](CUMPLE_COMPLETO.md)

## Estado del repositorio

Este README documenta el estado actual del monorepo con frontend local, microservicios NestJS, tests principales y despliegue en Vercel/Render.