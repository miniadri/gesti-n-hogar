# HomeSync — App web familiar (responsive) con datos persistentes, OCR, Google Calendar y notificaciones web

App familiar de gestión del hogar en español, **web responsive** (móvil, tablet, desktop). Basada en las 14 pantallas HTML ya recibidas. Multi-usuario dentro de un mismo "hogar" (household) con roles admin/miembro. Preparada para empaquetar con **PWABuilder** más adelante.

## Coste esperado

- **Lovable Cloud** (BD, auth, storage, realtime): cubierto por la asignación mensual gratuita del plan para un hogar familiar.
- **Lovable AI Gateway** (OCR con Gemini + recetas IA): asignación mensual gratuita pequeña; después céntimos por operación.
- **Google Calendar App User Connector**: gratis.
- **Notificaciones web push**: **gratis para pruebas familiares**. Se generan VAPID keys locales sin coste. El navegador usa los servidores push gratuitos de Google/Apple/Mozilla hasta cierto volumen; para una familia no hay gasto.
- **Emails**: **omitidos en esta fase**.

## Alcance funcional

### 1. Auth y hogar
- Email/contraseña + Google (vía `lovable.auth.signInWithOAuth`).
- Tabla `profiles` (nombre, avatar, idioma, moneda preferida) con trigger de creación desde `auth.users`.
- Tablas `households` y `household_members`; roles en tabla separada `user_roles` + `has_role(uuid, app_role)` security-definer.
- Helper SQL `current_household()` para RLS.
- Al registrarte se crea tu hogar por defecto. Los admins generan **códigos de invitación** (`household_invites`) para que familiares se unan a tu hogar.
- Perfiles infantiles (miembros sin cuenta, gestionados por un adulto).

### 2. Módulos con datos persistentes
Todas las tablas con `GRANT` a `authenticated` + RLS por `household_id`.

- `tasks` — asignación, estado, recurrencia, fecha límite, categoría.
- `calendar_events` — inicio/fin, categoría, asistentes, `source` (`local`/`google`), `external_id`.
- `inventory_items` — categoría, stock, mínimo, ubicación, caducidad, precio último conocido.
- `shopping_lists` — **una por supermercado + una lista genérica "Sin tienda"**. Estilo Bring!:
  - Tabla `stores` (Mercadona, Lidl, Carrefour, "Sin tienda"...).
  - Tabla `shopping_list_items` con `store_id` nullable, `manual_price`, `ocr_price`, `image_url`, `category`, `quantity`, `checked`.
  - UI agrupa items por tienda; añadir item con selector de tienda opcional (si no se elige → lista genérica).
  - Vista visual con tarjetas con imagen del producto (iconos por categoría por defecto), fáciles de tachar.
- `expenses` + `expense_categories` + `budgets` (presupuesto mensual por categoría + aportaciones por miembro proporcionales al salario).
- `salaries` (por miembro, para cálculo de aportaciones).
- `recipes` + `recipe_ingredients` (favoritas y generadas por IA, filtros dietéticos).
- `meal_plans` (planificador semanal equilibrado).
- `devices` (mantenimiento próximo).
- `notifications` (in-app).
- `push_subscriptions` (suscripciones web push por usuario).
- `receipts` (metadatos del ticket + link a bucket).

### 3. Notificaciones

#### In-app
- Tabla `notifications` + Supabase Realtime → campana en top bar con badge + toasts (`sonner`).
- Disparadores: tarea próxima a vencer, stock bajo, evento próximo, presupuesto excedido, mantenimiento programado.

#### Web Push (gratis para pruebas)
- Service worker de mensajería `public/sw.js` (separado del service worker de app shell; sigue vivo tras PWABuilder).
- VAPID keys generadas sin coste (`web-push` o `npx web-push generate-vapid-keys`).
- Server function `sendPushNotification(userIds[], payload)` que lee `push_subscriptions` y envía a los endpoints push del navegador.
- Flujo de suscripción: el navegador pide permiso, guarda subscription en `push_subscriptions`.
- Disparadores idénticos a in-app; cuando el usuario no tiene la app enfocada, el navegador muestra la notificación push.
- **No se usa Firebase/OneSignal ni servicio de pago**: para una familia, los servidores push del navegador son suficientes y gratuitos.
- **Emails omitidos** en esta fase.

### 4. OCR de tickets
- Cámara / subida → bucket privado `receipts`.
- Server function `ocr.functions.ts` → AI Gateway (`google/gemini-3-flash-preview`, multimodal `image_url`) con structured output para extraer: comercio (matching contra `stores`), fecha, líneas (nombre, cantidad, precio unitario, total), total.
- UI de revisión editable → al confirmar:
  - Crea `expense` con líneas.
  - Actualiza precio (`ocr_price`) de items en el inventario/lista de compra que coincidan.
  - Opcionalmente marca items de la lista como comprados.

### 5. Sincronización con Google Calendar
- **App User Connector** `google_calendar` (cada miembro conecta su propia cuenta desde `settings/integrations`).
- Pull inicial de eventos → `calendar_events` con `source='google'`.
- Push: crear/editar evento local → sube al Google Calendar del creador.
- Sync incremental con `syncToken`; webhook (`watch`) en `/api/public/webhooks/google-calendar` + fallback `pg_cron` cada 15 min contra `/api/public/cron/calendar-sync` (protegido con `CRON_SECRET`).
- Arquitectura preparada para Apple/Outlook luego (columna `source`, futura tabla de conexiones por proveedor).

### 6. Recetas IA
- Server function que llama al AI Gateway con la lista de inventario disponible + filtros dietéticos → devuelve receta estructurada.
- Guarda en `recipes` con `source='ai'`.
- Guía de voz IA (fase posterior; UI ya mostrada en mock, se dejará como stub).

## Diseño responsive (web-first)

Los mocks son mobile-first; los adapto a tres breakpoints:
- **Móvil (<768px)**: bottom tab bar de 5 elementos (Dashboard, Tareas, Calendario, Compra, Finanzas). Una columna. Coincide con los mocks.
- **Tablet (768–1279px)**: rail lateral estrecho (iconos + labels), grids de 2 columnas.
- **Desktop (≥1280px)**: sidebar completa (240px), `max-w-7xl` centrado, grids 3–4 columnas, se oculta bottom nav.
- Patrón `grid + min-w-0 + shrink-0` en cabeceras.
- `AppShell` decide sidebar vs bottom nav con `useIsMobile` + `md:` / `xl:`.

## Manifest y branding (para PWABuilder)

- Añadir `public/manifest.webmanifest` con el contenido que has facilitado (name, short_name, description, `start_url=/dashboard`, theme `#3b82f6`, background `#f8f9fa`, shortcuts a `/shopping` y `/tasks`, categorías, screenshots).
- Sustituir los iconos de Unsplash por iconos propios generados en `public/icon-192.png` y `public/icon-512.png` (evita dependencia externa; PWABuilder los exige locales para empaquetar).
- Enlazar `<link rel="manifest">`, `theme-color`, `apple-touch-icon` desde `__root.tsx`.
- **No** registrar service worker de app shell propio. Sólo el service worker de mensajería push (`public/sw.js`) para notificaciones web.

## Rutas (TanStack Start)

- **Públicas**: `/`, `/auth`, `/auth/callback`, `/reset-password`, `/api/public/webhooks/google-calendar`, `/api/public/cron/*`.
- **Autenticadas** bajo `_authenticated/`:
  - `/dashboard`
  - `/tasks`
  - `/calendar`
  - `/inventory`, `/inventory/smart-fridge`
  - `/shopping` (vista Bring! agrupada por tienda), `/shopping/scan-ticket`
  - `/recipes`, `/recipes/$id`, `/recipes/planner`
  - `/finances`, `/finances/expenses`, `/finances/subscriptions`, `/finances/categories`
  - `/devices` (schedules)
  - `/settings/family`, `/settings/localization`, `/settings/integrations`, `/settings/email-tickets`, `/settings/notifications`
- `/` redirige a `/dashboard` si hay sesión, si no a `/auth`.
- Cada ruta define su propio `head()`.

## Sistema de diseño

- Tokens **oklch** en `src/styles.css`: primary derivado de `#3b82f6`, background `#f8f9fa`, superficies neutras, colores para categorías de gasto/tienda.
- Fuentes `Manrope` (display) + `Public Sans` (body) vía `<link>` en `__root.tsx`.
- Modo oscuro completo con variables `.dark`.
- Componentes shadcn: `button, card, dialog, tabs, sheet, avatar, dropdown-menu, input, form, sonner, badge, checkbox, select, popover, calendar, chart`.
- Nunca colores hardcoded.

## Backend

- Server functions en `src/lib/*.functions.ts` por dominio (tasks, inventory, shopping, finances, recipes, devices, notifications, push, ocr, recipes-ai, calendar-sync, households).
- `requireSupabaseAuth` en todas las privadas; bearer middleware en `src/start.ts`.
- `supabaseAdmin` importado dinámicamente dentro de handlers cuando haga falta (webhook, invitaciones).
- Server routes públicas con `CRON_SECRET` / firma.
- Una migración SQL única inicial con: enum `app_role`, tablas + `GRANT` + `ENABLE RLS` + `POLICY` + triggers de `profile` y `household` por defecto + `has_role` + `current_household`.

## Preparado para i18n

- Textos en español ahora, envueltos en helper `t('key')` mínimo con `src/locales/es.json`.
- Selector idioma/moneda en `settings/localization` funcional (guarda en `profile`).
- Añadir inglés después = añadir `en.json` sin refactor.

## Secretos necesarios

- `LOVABLE_API_KEY` (ya existe) — AI Gateway.
- `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` — generados gratis para web push.
- `CRON_SECRET` — protege `/api/public/cron/*` (generado con `generate_secret`).
- `GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY` — se sincroniza al enlazar el App User Connector.

## Fases de implementación

1. **Base**: habilitar Lovable Cloud, migración de esquema completa, auth email+Google, `AppShell` responsive, manifest + iconos + tokens de diseño, layout `_authenticated`.
2. **CRUD hogar/miembros/invitaciones**, perfiles infantiles, `settings/localization` y `settings/family`.
3. **Compra estilo Bring!**: tiendas, listas agrupadas, items con imagen, precio manual, marcar comprado.
4. **Inventario / smart fridge** con caducidades y stock mínimo.
5. **Tareas** con recurrencia y asignación por miembro.
6. **Finanzas**: gastos, categorías, presupuestos, aportaciones proporcionales al salario, suscripciones.
7. **Calendario local** (eventos, planificación familiar).
8. **Recetas** manuales + planificador semanal + filtros dietéticos.
9. **Dispositivos** y mantenimiento programado.
10. **Notificaciones in-app** (tabla + Realtime + campana + toasts).
11. **Web push**: service worker `public/sw.js`, VAPID keys, suscripción, envío, `settings/notifications`.
12. **OCR de tickets** (bucket, upload, Gemini vision, revisión, propaga precios al inventario/lista de compra).
13. **Recetas IA** a partir del inventario.
14. **Google Calendar App User Connector**: conectar, pull, push, webhook + cron fallback.
15. **Polish**: dark mode, formato fecha/moneda, PWA manifest fino para PWABuilder, helper i18n listo.

## Fuera de alcance de esta fase

- Emails (se añaden tras tener dominio propio).
- Apple Calendar / Outlook (arquitectura preparada).
- Empaquetado nativo iOS/Android (lo hará PWABuilder).
- Guía de voz IA en cocina (UI stub por ahora).
- Domótica real (control de luces/termostato solo UI stub).
- Escaneo de emails para importar tickets automáticamente (UI stub en `settings/email-tickets`).
- Pagos/suscripciones de la app.
