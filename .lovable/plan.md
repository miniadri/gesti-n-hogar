## Objetivo

Activar sincronización en tiempo real entre miembros del mismo hogar usando Supabase Realtime, y dejar documentado el camino de migración a polling/SaaS para el futuro.

## 1. Migración SQL

Habilitar Realtime en las tablas donde importa que los cambios se reflejen al instante entre miembros:

- `tasks`, `expenses`, `budgets`
- `shopping_list_items`, `shopping_lists`
- `inventory_items`, `medicines`
- `meal_plans`, `meal_plan_days`
- `calendar_events`
- `notifications`
- `household_members`, `households`

Cada tabla se añade a `supabase_realtime` publication y se ajusta `REPLICA IDENTITY FULL` para recibir payloads completos en UPDATE/DELETE.

## 2. Hook `useRealtimeSync`

Nuevo `src/hooks/use-realtime-sync.ts`:

- Se monta una vez en `_authenticated/route.tsx` (dentro del árbol protegido, tras conocer el `household_id`).
- Abre **un único canal por hogar** (`household:{id}`) con múltiples listeners `postgres_changes` filtrados por `household_id`.
- Al recibir cambios, hace `queryClient.invalidateQueries` sobre las keys afectadas (mapeo tabla → query keys).
- Cleanup con `supabase.removeChannel` en unmount para evitar fugas.
- Filtra por `household_id` en el filtro del listener para no recibir cambios de otros hogares (respetando RLS igualmente).

## 3. Indicador visual

Pequeño badge en el header ("● En vivo" / "○ Reconectando") basado en el estado del canal (`SUBSCRIBED` / `CHANNEL_ERROR` / `TIMED_OUT`). No intrusivo.

## 4. Documentación de escalado

Crear `docs/SCALING.md` con:

- Diagnóstico actual: Realtime OK para uso familiar / beta cerrada dentro de Lovable Free.
- Umbrales aproximados de mensajes/conexiones concurrentes que forzarían migración.
- Plan alternativo si se lanza como SaaS público:
  - Sustituir Realtime por **polling con React Query** (`refetchInterval` 30–60s, `refetchOnWindowFocus`).
  - Reservar Realtime solo para notificaciones críticas.
  - Considerar batching de mutations, caché edge, y rediseño multi-tenant.
- Checklist de migración (qué hooks quitar, qué añadir).

## 5. Fuera de alcance

- No se implementa optimistic updates aún (siguiente iteración si se pide).
- No se toca lógica de negocio existente.
- No se cambia RLS (ya filtra por hogar).

## Detalles técnicos

- Un solo canal por hogar reduce conexiones concurrentes vs. un canal por tabla.
- Mapeo tabla → queryKeys centralizado en el hook para mantenimiento fácil.
- El hook respeta la regla `useEffect` + cleanup del knowledge de realtime para evitar loops de reconexión.
