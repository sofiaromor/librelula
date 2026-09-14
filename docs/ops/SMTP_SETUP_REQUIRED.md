# SMTP setup required

Estado (comprobado el 14 de septiembre de 2026): SMTP externo configurado;
entrega bloqueada por la restricción de IP de Brevo.

Librélula ya implementa registro con confirmación y recuperación de contraseña en frontend. Para entregar emails a usuarios externos, Supabase Auth necesita un SMTP externo.

## Incidencia confirmada

El proyecto de producción usa Supabase `bpdjcnhmdydzureeyyod`. Se comprobó en
Dashboard que SMTP está activado con Brevo, puerto 587 e intervalo mínimo de
60 segundos por usuario. No faltan por configurar las credenciales SMTP.

Los Auth Logs del 13 de septiembre muestran respuestas 500 en `/recover` y
`/otp` con el error SMTP `525 "5.7.1 Unauthorized IP address"`. Brevo documenta
que ese error corresponde al bloqueo de una IP de origen no autorizada:
https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP

Revisar en Brevo **Settings > Security > Authorized IPs** las IP bloqueadas para
SMTP y contrastarlas con los envíos fallidos de Supabase. El servidor que envía
es Supabase Auth; autorizar la IP del navegador o de Vercel no resuelve el fallo.
No deducir la IP de salida SMTP a partir de la dirección DNS pública del proyecto.

Si se mantiene el bloqueo por IP, deben autorizarse los orígenes de Supabase que
realmente se utilizan y verificarse otra vez después de cambios de infraestructura.
Brevo permite gestionar el bloqueo de API y SMTP por separado, aunque la lista
de IP autorizadas es compartida. Cambiar esa protección requiere una decisión
explícita del propietario:
https://help.brevo.com/hc/en-us/articles/5740111683858-Authorize-and-block-IP-addresses-for-API-and-SMTP-security

La entrega a un buzón y los flujos completos de alta y recuperación siguen
pendientes de comprobar después de corregir la restricción del proveedor.

## Opción seleccionada

Brevo Free (0 EUR/mes en la fase inicial).

## Datos que deben existir antes de activar producción

- SMTP host
- SMTP port
- SMTP username
- SMTP password/key
- Sender email verificado
- Sender name: Librélula

Estos valores son secretos operativos y no deben añadirse al repositorio.

## Configuración objetivo en Supabase

Authentication > Emails > SMTP Settings

Después de guardar las credenciales:

1. Site URL: `https://librelula.vercel.app`
2. Redirect allowlist: `https://librelula.vercel.app/**`
3. Confirm signup habilitado.
4. Ejecutar la checklist `docs/qa/auth-email-checklist.md` con una dirección externa.

## Definition of Done

- Registro externo recibe confirmación.
- Confirmación devuelve a Librélula.
- Recovery externo recibe email.
- Recovery abre `?auth=recovery`.
- Password update funciona.
- Login con nueva contraseña funciona.
- Auth logs no muestran errores de SMTP/redirect.
