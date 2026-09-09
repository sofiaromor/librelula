# Librélula · Colecciones públicas

## Objetivo de producto

Los estados de lectura y las colecciones son conceptos distintos:

- **Estado**: dónde está un libro dentro de la lectura (`Leyendo`, `Leído`, `Pendiente`, etc.).
- **Balda del sistema**: cómo Mi biblioteca agrupa visualmente esos estados.
- **Colección**: una selección editorial creada por la persona usuaria (`Otoño cozy`, `Mis cinco estrellas`, `Romantasy`, etc.).

La separación evita convertir Mi biblioteca en un panel de filtros y permite que el perfil tenga una capa social clara.

## Experiencia

Cada colección admite:

- nombre y descripción;
- color elegido dentro de una paleta Librélula controlada;
- visibilidad pública o privada;
- hasta 200 libros de la biblioteca de su propietaria;
- orden estable de libros;
- seguimiento por otras personas cuando es pública.

En el perfil se muestra como una tarjeta editorial con una mini estantería física, 3–5 portadas, color propio y una balda de madera. La creación/edición se abre como modal en escritorio y como bottom sheet en móvil.

La pestaña `Colecciones` tiene una URL compartible con el formato `?collections=<profile_id>`. Esa ruta solo monta la lectura pública de colecciones y no expone el resto del perfil a visitantes anónimos.

## Privacidad

- Las colecciones privadas solo son visibles para su propietaria.
- Las públicas pueden leerse sin iniciar sesión.
- Seguir una colección requiere autenticación.
- Los clientes no pueden consultar la identidad del conjunto completo de seguidores.
- El número de seguidores se obtiene mediante una función agregada que devuelve únicamente conteos.
- Al pasar una colección de pública a privada se eliminan todos sus follows; la migración también limpia follows heredados de colecciones que ya sean privadas. Si vuelve a ser pública, cada persona debe seguirla de nuevo.
- Solo la propietaria puede editar o eliminar una colección.
- Los libros de una colección se reemplazan mediante una función transaccional y deben pertenecer a la biblioteca de la propietaria.

## Rollout

La interfaz tolera que la migración todavía no exista: muestra una vista previa controlada y no intenta persistir cambios.

La migración `supabase/library-collections-v18.sql` es transaccional, comprueba duplicados antes del índice único y no se ejecutará en producción hasta hacer backup/export del esquema, probarla en staging y verificar RLS con al menos dos cuentas y una sesión anónima.

Casos mínimos antes de activar producción:

1. Propietaria ve públicas y privadas.
2. Otra cuenta solo ve públicas.
3. Sesión anónima solo ve públicas.
4. Otra cuenta no puede modificar metadatos ni libros.
5. Un follow solo puede crearse para el usuario autenticado.
6. La lista de identidades de seguidores no es legible desde cliente.
7. El contador agregado sí devuelve el total correcto.
