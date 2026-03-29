# Acceso Local y desde Celular WiFi

## Estado actual

Los servicios estan configurados para escuchar en todas las interfaces (0.0.0.0), lo cual es necesario para acceso desde otros dispositivos de la red.

## Como entrar segun el dispositivo

1. Desde tu propia PC:
	- Usa localhost
	- Ejemplo: http://localhost:3003

2. Desde tu celular en la misma red WiFi:
	- No uses localhost (en el celular, localhost es el propio telefono)
	- Usa el nombre de tu PC
	- Ejemplo: http://DESKTOP-ASB6VG1:3003

## URLs por servicio

- User Service: http://localhost:3000 (PC) o http://DESKTOP-ASB6VG1:3000 (celular)
- Event Service: http://localhost:3001 (PC) o http://DESKTOP-ASB6VG1:3001 (celular)
- Ticketing Service: http://localhost:3002 (PC) o http://DESKTOP-ASB6VG1:3002 (celular)
- Notification Service: http://localhost:3003 (PC) o http://DESKTOP-ASB6VG1:3003 (celular)
- Credential Service: http://localhost:3004 (PC) o http://DESKTOP-ASB6VG1:3004 (celular)
- Agenda Service: http://localhost:3005 (PC) o http://DESKTOP-ASB6VG1:3005 (celular)
- Analytics Service: http://localhost:3006 (PC) o http://DESKTOP-ASB6VG1:3006 (celular)
- Mobile API Service: http://localhost:3007 (PC) o http://DESKTOP-ASB6VG1:3007 (celular)
- API Gateway: http://localhost:3008 (PC) o http://DESKTOP-ASB6VG1:3008 (celular)

## Verificacion hecha

- Puertos 3000 a 3008 en escucha
- Endpoints principales respondiendo HTTP 200 en localhost
- Endpoints principales respondiendo HTTP 200 por nombre de equipo

## Si el celular no conecta

1. Verifica que PC y celular esten en la misma WiFi.
2. Permite puertos en firewall de Windows (3000 a 3009).
3. Si tu red no resuelve el nombre DESKTOP-ASB6VG1, usa la IP local solo como alternativa temporal.

Comando de firewall (PowerShell administrador):

New-NetFirewallRule -DisplayName "Microservices" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000-3009
