# Escalado y sincronización

## Estado actual (uso familiar / beta cerrada)

La app usa **Supabase Realtime** para sincronizar cambios entre los miembros de un mismo hogar en tiempo real.

- Un único canal por hogar (`household:{id}`) montado en `src/hooks/use-realtime-sync.ts`.
- Se suscribe a INSERT/UPDATE/DELETE de las tablas relevantes (tareas, gastos, presupuestos, lista de la compra, inventario, medicinas, plan de comidas, calendario, notificaciones, miembros y hogares).
- Los payloads se filtran por `household_id` y disparan `invalidateQueries` en React Query.
- Indicador visual en la barra superior ("● En vivo").

Este diseño cabe cómodamente en **Lovable Cloud Free** para uso familiar o beta cerrada (pocos hogares, pocos usuarios concurrentes).

## Cuándo migrar

Migrar cuando alguno de estos indicadores empiece a acercarse a los límites del plan gratuito:

- **Conexiones concurrentes** cercanas al límite del plan (Realtime abre un websocket por sesión activa).
- **Mensajes/mes** de Realtime en aumento sostenido.
- **Muchos hogares activos simultáneamente** (SaaS público).

## Plan de migración a polling / SaaS público

1. **Sustituir el hook `useRealtimeSync` por polling** con React Query:
   - `refetchInterval: 60_000` en las queries clave (dashboard, compra, tareas).
   - `refetchOnWindowFocus: true` para actualizar al volver a la pestaña.
   - Coste: peticiones HTTP normales (contadas en Data API, mucho más baratas que websockets persistentes).

2. **Reservar Realtime solo para notificaciones críticas**:
   - Ej. push de tarea urgente asignada, nueva invitación de hogar.
   - Un solo canal ligero por usuario, no por tabla.

3. **Rediseño multi-tenant**:
   - Batching de mutations (evitar N updates cuando uno agrupa varios).
   - Considerar caché edge para lecturas frecuentes públicas.
   - Auditar RLS: cada consulta debe filtrar por `household_id` server-side.
   - Índices en columnas `household_id` (ya presentes en la mayoría de tablas).

4. **Monitorización**:
   - Revisar `credits--get_credit_balance` mensualmente durante el crecimiento.
   - Alertas al llegar al 70% de cualquier límite.

## Checklist de migración

- [ ] Quitar la llamada a `useRealtimeSync` en `src/routes/_authenticated.tsx`.
- [ ] Quitar el indicador `realtimeStatus` de `AppShell`.
- [ ] Añadir `refetchInterval` en `queryOptions` de las páginas críticas.
- [ ] Migración SQL: `ALTER PUBLICATION supabase_realtime DROP TABLE ...` para las tablas que no sean estrictamente necesarias en vivo.
- [ ] Mantener realtime solo en `notifications` (o similar).
- [ ] Revalidar plan de precios de Lovable/Supabase.
