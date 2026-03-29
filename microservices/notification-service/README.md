# Notification Service

Microservicio para gestión de notificaciones. Incluye conexión a PostgreSQL y buenas prácticas de NestJS.

## Resend en Render Free

Para Render Free, SMTP saliente por 25, 465 y 587 no es una opcion fiable. Este servicio ya soporta Resend por HTTPS.

### Variables necesarias

- RESEND_API_KEY: API key de Resend con permiso Sending access.
- RESEND_FROM: remitente verificado en Resend. Ejemplo: EventHive <no-reply@mail.tudominio.com>
- RESEND_REPLY_TO: opcional, correo de respuesta visible para el usuario.

### Comportamiento actual

- Si RESEND_API_KEY y RESEND_FROM existen, el servicio envia por Resend.
- Si Resend no esta configurado, el servicio usa SMTP como fallback.
- Si Resend esta configurado a medias, el servicio devuelve un error claro y no intenta caer silenciosamente a SMTP.

### Activacion recomendada

1. Crea una API key en Resend.
2. Verifica tu dominio en Resend con SPF y DKIM.
3. Carga RESEND_API_KEY, RESEND_FROM y opcionalmente RESEND_REPLY_TO en Render para eventhive-notification-service.
4. Haz redeploy del servicio.
