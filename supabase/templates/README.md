# Librélula · Auth email templates

Templates transaccionales de Supabase Auth con identidad visual de Librélula.

## Principios

- Español como idioma de producto.
- HTML de email conservador: tablas de presentación, estilos inline y sin JavaScript.
- Paleta alineada con el login de producción (`#faf7f2`, `#fdf6ee`, `#2c1f0e`, `#b8896a`, `#9a8570`).
- CTA principal claro y una única acción por mensaje.
- Mensajes de seguridad explícitos en operaciones sensibles.
- Ningún secreto, token real o credencial se almacena en estos archivos. Los placeholders `{{ ... }}` los resuelve Supabase Auth en el momento del envío.

## Mapeo para Supabase Dashboard

Ruta: **Authentication → Emails → Email Templates**.

| Supabase template | Archivo | Asunto recomendado |
| --- | --- | --- |
| Confirm signup | `confirmation.html` | `Activa tu cuenta lectora · Librélula` |
| Reset password | `recovery.html` | `Restablece tu contraseña · Librélula` |
| Change email address | `email_change.html` | `Confirma tu nuevo correo · Librélula` |
| Magic link | `magic_link.html` | `Tu acceso a Librélula` |
| Reauthentication | `reauthentication.html` | `{{ .Token }} · Código de verificación de Librélula` |
| Password changed notification | `password_changed_notification.html` | `Tu contraseña ha cambiado · Librélula` |
| Email changed notification | `email_changed_notification.html` | `Tu correo ha cambiado · Librélula` |

## Activación en producción

1. Abrir el template correspondiente en Supabase Dashboard.
2. Copiar el HTML completo del archivo versionado en este directorio.
3. Establecer el asunto recomendado.
4. Guardar.
5. Enviar una prueba real desde `https://librelula.vercel.app`.
6. Verificar Gmail móvil/escritorio, spam, CTA y redirect final.
7. Para un remitente profesional, usar SMTP personalizado y configurar `Librélula` como sender name. La credencial SMTP nunca debe guardarse en GitHub.

## QA mínimo

### Confirmación
- El asunto y el contenido están en español.
- El CTA `Confirmar mi cuenta` valida el email y vuelve al dominio canónico.
- Un registro repetido puede usar el flujo de reenvío implementado en la aplicación.

### Recuperación
- El CTA `Restablecer contraseña` abre el flujo `?auth=recovery`.
- El usuario puede introducir el código de seis cifras en Librélula si el enlace no funciona o su correo lo previsualiza.
- El usuario puede establecer la nueva contraseña y volver a iniciar sesión.
- Si el usuario no solicitó el cambio, el email explica que puede ignorarlo.

### Seguridad
- Las notificaciones de cambio de contraseña/email no contienen secretos.
- No se muestran credenciales ni detalles internos de Supabase.
- Las plantillas usan únicamente variables oficiales de Supabase (`ConfirmationURL`, `Token`, `Email`, `NewEmail`, `OldEmail`).

### Acceso sin contraseña
- `magic_link.html` muestra el enlace y el código de seis cifras.
- Librélula solicita el acceso con `shouldCreateUser: false`, por lo que este flujo no crea cuentas nuevas accidentalmente.

## Fuente de verdad

Estos archivos son la fuente versionada de diseño y copy. Si se edita un template directamente en Supabase Dashboard, el cambio debe replicarse después aquí para evitar drift entre producción y repositorio.
