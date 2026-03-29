# Ticketing Service

Microservicio para gestión de tickets. Incluye conexión a PostgreSQL y buenas prácticas de NestJS.

## Interfaces por rol

- Cliente: `/tickets/client`
- Organizador: `/tickets/organizer`
- Staff (validación QR): `/tickets/staff`

La separación por rol reduce mezcla de permisos en UI y mantiene la seguridad en backend con guards y JWT.
