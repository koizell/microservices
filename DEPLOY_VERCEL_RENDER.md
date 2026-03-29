# Despliegue Vercel + Render

## Arquitectura propuesta

- Vercel sirve el frontend de la carpeta frontend.
- Vercel actua como reverse proxy de las rutas publicas /users, /events, /tickets, /notifications, /gateway, /credentials, /analytics, /agenda y /mobile.
- Render ejecuta cada microservicio NestJS.
- Supabase provee la base PostgreSQL compartida mediante una URL externa.
- Las llamadas entre microservicios en Render usan host internos host:port; el codigo ya los normaliza a HTTP.
- RabbitMQ queda opcional en produccion: si no defines RABBITMQ_URL, los servicios no intentan conectarse a localhost.

## Paso 0. Preparar Supabase

1. Crea un proyecto PostgreSQL en Supabase.
2. Copia la cadena de conexion de PostgreSQL que usaras en backend. Debe incluir SSL, normalmente con sslmode=require.
3. En el editor SQL de Supabase ejecuta el esquema de [microservices/database_schema.sql](microservices/database_schema.sql) para crear las tablas base.

## Paso 1. Crear la infraestructura en Render

1. Crea un nuevo Blueprint en Render usando render.yaml.
2. Durante la creacion pega la misma DATABASE_URL de Supabase en cada servicio que la solicite:
   - eventhive-user-service
   - eventhive-event-service
   - eventhive-ticketing-service
   - eventhive-notification-service
   - eventhive-credential-service
   - eventhive-analytics-service
   - eventhive-agenda-service
3. Completa ademas estos secretos:
   - APP_BASE_URL: URL publica del proyecto en Vercel, por ejemplo https://tu-proyecto.vercel.app
   - SMTP_HOST
   - SMTP_USER
   - SMTP_PASS
   - EMAIL_FROM si no quieres reutilizar SMTP_USER como remitente
4. Si mas adelante quieres colas reales, agrega manualmente RABBITMQ_URL en:
   - eventhive-ticketing-service
   - eventhive-notification-service
   - eventhive-credential-service
   - eventhive-analytics-service

Nota de build en Render:
- Como el blueprint fija NODE_ENV=production, los servicios NestJS deben compilar con devDependencies incluidas. Por eso render.yaml usa buildCommand con npm install --include=dev antes de npm run build.

## Paso 2. Configurar Vercel

1. Crea el proyecto apuntando a la carpeta frontend como Root Directory.
2. Agrega estas variables de entorno en Vercel con las URLs publicas de Render:
   - GATEWAY_RENDER_URL
   - USER_SERVICE_RENDER_URL
   - EVENT_SERVICE_RENDER_URL
   - TICKETING_SERVICE_RENDER_URL
   - NOTIFICATION_SERVICE_RENDER_URL
   - CREDENTIAL_SERVICE_RENDER_URL
   - ANALYTICS_SERVICE_RENDER_URL
   - AGENDA_SERVICE_RENDER_URL
   - MOBILE_SERVICE_RENDER_URL
3. Despliega. Las reglas de frontend/vercel.json haran que cada ruta publica pase por el proxy de frontend/api/proxy/[[...path]].js.

## Paso 3. Verificaciones recomendadas

1. Abre /gateway/health en tu dominio de Vercel.
2. Abre /users y registra un usuario para validar APP_BASE_URL y correos.
3. Abre /notifications para confirmar que el panel de notificaciones y campañas carga correctamente.
4. Abre / y verifica que el CRUD del frontend funciona sin puertos fijos.

## Variables importantes en Render

- DATABASE_URL: debe ser la cadena de conexion de Supabase y debe incluir SSL; usala igual en todos los servicios que tienen base de datos.
- JWT_SECRET: se genera una vez y se comparte entre servicios.
- DB_SYNCHRONIZE: queda en false para evitar cambios destructivos de esquema en cloud.
- APP_BASE_URL: debe apuntar a Vercel para que confirmacion de correo y reset funcionen desde el dominio publico.
- NODE_OPTIONS: usa --dns-result-order=ipv4first para evitar que Node intente resolver Supabase por IPv6 primero en Render.

## Notas operativas

- El blueprint usa plan free en los web services para reducir costo inicial. Si necesitas evitar cold starts, cambia esos planes en Render.
- El blueprint ya no crea Postgres en Render, asi que el costo del dashboard no deberia incluir una base administrada por Render.
- mobile-api-service y api-gateway no necesitan DATABASE_URL porque consumen otros servicios internamente.
- El render.yaml no fuerza RABBITMQ_URL porque ahora la degradacion en produccion es explicita y no intenta localhost.
- Si ya creaste servicios y luego anades nuevos campos sync: false, Render no volvera a pedirlos automaticamente; en ese caso agregalos manualmente desde el dashboard.