# Lista de Deseos (subsección de Tareas)

Nueva subsección dentro de Tareas para gestionar deseos/regalos del hogar, con reservas secretas para no arruinar la sorpresa.

## Qué verá el usuario

- En `/tasks` aparecen dos pestañas: **Tareas** y **Lista de Deseos**.
- En Lista de Deseos:
  - Botón "Añadir deseo": título, descripción opcional, enlace opcional al producto, precio estimado opcional, prioridad (bajo/medio/alto) y "¿Para quién?" (yo mismo u otro miembro del hogar).
  - Vista agrupada por miembro destinatario, con la sección "Mis deseos" primero.
  - Si alguien sugiere un deseo **para ti**, aparece como "Sugerencia" con botones **Me gusta** / **Descartar**. Los descartados se ocultan tras un filtro "Ver descartados".
  - Cada deseo muestra su enlace (abre en pestaña nueva) y quién lo propuso.
- Reservas secretas (regalos):
  - En los deseos de **otros** miembros aparece "Lo regalo yo" para marcar seguimiento, con notas y estado (pensándolo / comprado / entregado).
  - Una pestaña/filtro "Mis regalos" reúne todo lo que has reservado.
  - Seguimiento de precio independiente de la Lista de Compra (no usa el catálogo de supermercados): quien reserva puede guardar el precio visto y la tienda (Amazon, MediaMarkt, PcComponentes, tienda física, otra) junto al enlace, además de accesos rápidos para buscar el título del deseo en esas tiendas online.
  - **El dueño del deseo nunca ve las reservas**: ni contador, ni nombre, ni indicio alguno. La ocultación se aplica en la base de datos, no solo en la interfaz.

## Reglas de privacidad

- Un deseo cuyo destinatario eres tú: ves el deseo, puedes aceptarlo/descartarlo y editarlo, pero no ves reservas.
- Cualquier otro miembro del hogar (excepto el destinatario) ve el deseo y las reservas asociadas.
- Los perfiles infantiles pueden tener deseos creados para ellos; no se cambia su rol ni permisos actuales.

## Detalles técnicos

Migración nueva: `supabase/migrations/20260824220000_add_wishlist.sql` (te la dejo ahí, con ese nombre).

Tablas:

- `public.wishlist_items`
  - `household_id`, `created_by_member_id`, `for_member_id`, `title`, `description`, `url`, `estimated_price`, `priority`, `status` (`active` | `fulfilled` | `archived`), `recipient_reaction` (`pending` | `liked` | `dismissed`), `created_at`, `updated_at` + trigger `set_updated_at`.
  - GRANTs a `authenticated` y `service_role`; RLS con `is_household_member(household_id, auth.uid())` para leer; insertar/editar/borrar por autor, destinatario o admin del hogar.
- `public.wishlist_claims`
  - `wishlist_item_id`, `household_id`, `claimer_member_id`, `status` (`considering` | `purchased` | `gifted`), `notes`, `tracked_price`, `tracked_store`, `tracked_url`, timestamps, único por (item, claimer).
  - RLS clave: la política de SELECT usa una función `security definer` `public.can_view_wishlist_claim(_item_id uuid)` que devuelve `false` si `auth.uid()` es el usuario del `for_member_id` del deseo, y `true` para el resto de miembros del hogar. Así, aunque alguien consulte la API directamente, el destinatario no puede ver reservas de sus propios deseos.
  - INSERT/UPDATE/DELETE solo del propio `claimer_member_id` y nunca sobre deseos dirigidos a uno mismo.

Servidor: nuevo `src/lib/wishlist.functions.ts` con `createServerFn` + `requireSupabaseAuth`:
`listWishlist`, `createWishlistItem`, `updateWishlistItem`, `deleteWishlistItem`, `reactToWishlistItem` (me gusta / descartar), `claimWishlistItem`, `updateWishlistClaim`, `releaseWishlistClaim`, `listMyClaims`. Las consultas de deseos nunca hacen join de claims para el destinatario; el filtrado real lo garantiza RLS.

Interfaz: nuevo componente `src/components/wishlist/WishlistPanel.tsx` (formulario, tarjetas, diálogo de reserva) y pestañas en `src/routes/_authenticated.tasks.tsx` sin renombrar el archivo. Invalidación de queries `["wishlist"]` y `["wishlist-claims"]`; se añade `wishlist_items` al mapa de realtime existente (las claims quedan fuera de realtime para no filtrar señales al destinatario).

Versión visible en Ajustes: v0.30.
