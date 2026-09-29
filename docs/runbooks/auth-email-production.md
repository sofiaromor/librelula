# Runbook: Auth email en producción

## Objetivo

Garantizar que registro, confirmación de email y recuperación de contraseña funcionen para usuarios externos en `https://librelula.vercel.app`.

## Dependencias

- Vercel: frontend de producción.
- Supabase: Auth, sesiones y usuarios.
- SMTP externo: entrega de correo transaccional.

## Configuración requerida en Supabase

### URL configuration

- Site URL: `https://librelula.vercel.app`
- Redirect URL permitida: `https://librelula.vercel.app/**`

### SMTP

Configurar en Authentication > Emails > SMTP Settings usando las credenciales del proveedor transaccional.

Nunca guardar host, usuario, contraseña o API keys privadas en el repositorio.

## Flujos de QA

### Alta

1. Abrir producción en una ventana privada.
2. Registrar una dirección externa de prueba.
3. Verificar que la UI informa de que debe confirmar el correo.
4. Comprobar recepción del mensaje.
5. Abrir el enlace de confirmación.
6. Confirmar que vuelve a `librelula.vercel.app`.
7. Iniciar sesión.
8. Verificar que se crea/carga el perfil y que la sesión persiste al recargar.

### Recuperación

1. Abrir Iniciar sesión.
2. Introducir el email de una cuenta existente.
3. Pulsar “¿Olvidaste tu contraseña?”.
4. Confirmar mensaje genérico de éxito.
5. Abrir el email de recuperación.
6. Confirmar que el enlace vuelve a `?auth=recovery`.
7. Introducir dos contraseñas iguales de al menos 6 caracteres.
8. Guardar.
9. Confirmar cierre de la sesión temporal de recovery.
10. Iniciar sesión con la contraseña nueva.
11. Confirmar que la contraseña anterior ya no funciona.

## Casos negativos

- Email inexistente: la UI no debe confirmar si existe o no una cuenta.
- Contraseñas distintas: no se debe llamar a `updateUser`.
- Contraseña demasiado corta: bloqueo en cliente y validación de Supabase.
- Enlace expirado o reutilizado: mostrar error y solicitar un enlace nuevo.
- SMTP no disponible: registrar el incidente; no exponer credenciales ni mensajes internos del proveedor.

## Observabilidad

- Supabase Auth Logs para errores de signup, recovery y verify.
- Vercel Deployments para verificar que la revisión que contiene el cambio está en producción.
- Proveedor SMTP para entregas, rebotes y bloqueos.

## Brevo rechaza una IP de Supabase

Un error `525 "5.7.1 Unauthorized IP address"` en Auth Logs significa que Brevo
rechazó la conexión SMTP antes de entregar el correo. Se observó en los flujos
`/recover` y `/otp` el 13 de septiembre de 2026. Reenviar desde el frontend no
corrige esta restricción.

1. Revisar **Settings > Security > Authorized IPs** en Brevo, incluyendo la lista
   de IP no autorizadas y la protección específica de SMTP.
2. Contrastar la IP bloqueada y el momento del bloqueo con una solicitud de
   prueba de Supabase. No autorizar orígenes desconocidos ni usar la IP de Vercel.
3. Autorizar únicamente el origen identificado, o decidir expresamente cómo
   gestionar la protección de SMTP si no se dispone de una IP de salida estable.
4. Solicitar un solo correo con una dirección de prueba autorizada y comprobar
   la respuesta de Supabase, los logs de Brevo y la recepción. Esperar al menos
   el intervalo configurado antes de pedir el siguiente.
5. Completar los flujos de QA de alta y recuperación de este documento.

La web evita solicitudes concurrentes y muestra la espera mínima de 60 segundos
por dirección. Un fallo SMTP no se considera un envío correcto ni inicia esa
espera. Un éxito de la API tampoco acredita por sí solo la recepción en el buzón.

Referencia del proveedor:
https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP

## Rollback

El cambio de frontend se revierte mediante Git/Vercel. La configuración SMTP es independiente y puede deshabilitarse desde Supabase Auth sin tocar código.
