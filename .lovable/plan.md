# Precios de más supermercados (Carrefour, Eroski, ECI, Alcampo, MAS, Caprabo…)

## Diagnóstico (comprobado ahora mismo)

He lanzado peticiones reales desde el servidor a los endpoints de esas cadenas. Resultado:

| Cadena | Resultado real |
|---|---|
| Carrefour (`search-api` y `cloud-api`) | 403 + pantalla "Just a moment…" (Cloudflare) |
| Eroski | 403 Forbidden |
| El Corte Inglés / Hipercor | 403 Access Denied (Akamai) |
| Alcampo | 404 (endpoint interno cambiado, y el resto protegido) |
| Caprabo | 403 Forbidden |

Conclusión: **no es un problema de URL ni de cabeceras**. Estas cadenas usan protección anti-bot (Cloudflare / Akamai) que bloquea cualquier petición hecha desde un servidor de datacenter. Mercadona, Día y Consum funcionan porque exponen APIs abiertas sin esa protección. Reintentar en tiempo real con otras cabeceras no va a funcionar de forma estable.

## Estrategia propuesta: dos velocidades

1. **Tiempo real (como ahora)** para las fuentes abiertas: Mercadona, Día y **Consum** (Consum ya está probado pero aún no está conectado al buscador; se añade).
2. **Caché alimentada por un rastreo programado** para las cadenas protegidas. Un trabajo diario/semanal recorre sus buscadores usando **Firecrawl** (navegador real con resolución de anti-bot, ya disponible como conector en el workspace) y guarda producto + precio + imagen + enlace en la base de datos. La búsqueda del usuario lee de esa caché: instantánea y sin depender de que la tienda responda en ese momento.

Así, al buscar un producto verás una fila por tienda con precio, foto y enlace: las abiertas en vivo, las protegidas desde la última captura (con etiqueta "precio del <fecha>").

## Qué se construye

**Base de datos (nuevas tablas, genéricas para cualquier cadena)**
- `store_catalog_products`: producto por cadena (fuente, id, nombre, marca, EAN si aparece, imagen, url, categoría, precio, precio por unidad, formato, fecha de captura).
- `store_catalog_price_history`: histórico diario de precios por producto, igual que ya existe para Mercadona, para ver subidas/bajadas.
- `store_catalog_terms`: lista de términos a rastrear (se alimenta sola con lo que la gente busca y con los productos del inventario/lista de la compra), para no rastrear el catálogo entero.

**Servidor (sin renombrar nada existente)**
- `src/lib/store-products.server.ts` (modificar): añadir Consum en vivo; añadir Eroski, Carrefour, ECI/Hipercor, Alcampo, MAS y Caprabo leyendo de la caché; unificar el ranking y el dedupe ya existentes; devolver `captured_at` y `is_cached` en cada sugerencia.
- `src/lib/store-scrape.server.ts` (nuevo): adaptadores Firecrawl por cadena (URL de búsqueda + extracción estructurada de nombre/precio/imagen/enlace), con reintentos, límite de peticiones y tolerancia a fallos por cadena.
- `src/lib/store-products.functions.ts` (modificar): ampliar el enum de fuentes y exponer `queueStoreTerm` para registrar términos buscados.
- `src/routes/api/public/hooks/store-catalog-refresh.ts` (nuevo): endpoint del cron protegido con `CRON_BEARER`, procesa un lote de términos por ejecución y escribe caché + histórico. Programado con pg_cron (diario de madrugada, escalonado respecto al de Mercadona).

**Interfaz (mismo estilo actual)**
- `src/components/MercadonaAutocomplete.tsx` (modificar, sin renombrar): resultados agrupados por tienda, etiquetas de las nuevas cadenas y aviso "precio del <fecha>" en las cacheadas.
- `src/lib/shopping.functions.ts` y `src/routes/_authenticated.shopping.index.tsx` (modificar): aceptar las nuevas fuentes al guardar un artículo y mostrar "Ver en <tienda>".
- `src/routes/_authenticated.inventory.index.tsx` (modificar): mismas fuentes al autocompletar productos del inventario.
- `src/components/StoreCatalogSourceExperiment.tsx` (modificar): el test de fuentes pasa a mostrar también estado de la caché (última captura, nº de productos, errores del último rastreo).

**Documentación**
- `docs/STORE-CATALOGS.md` (nuevo): cómo funciona cada fuente, por qué unas van en vivo y otras por caché, cómo añadir una cadena nueva, cómo se programa el cron y cómo diagnosticar fallos.

## Detalles técnicos

- Firecrawl se enlaza al proyecto con el conector (conexión ya existente, modo API directa con clave `fc-`); las llamadas se hacen sólo desde servidor.
- Coste controlado: sólo se rastrean los términos en `store_catalog_terms` (los que realmente se usan), con tope de peticiones por ejecución y frecuencia configurable (diaria por defecto, semanal para cadenas lentas).
- Reglas de la casa respetadas: RLS + GRANT en cada tabla nueva, lectura para miembros autenticados, escritura sólo `service_role`; cron autenticado con `CRON_BEARER`; ningún archivo se renombra.
- Si una cadena cambia su web, su adaptador falla de forma aislada: el resto sigue funcionando y el fallo aparece en el panel de fuentes.

## Fases

1. Enlazar Firecrawl + migración de las tres tablas nuevas.
2. Adaptadores de rastreo + endpoint de cron + programación pg_cron.
3. Búsqueda unificada (vivo + caché) y Consum en vivo.
4. Ajustes de interfaz en lista de la compra, inventario y panel de fuentes.
5. README `docs/STORE-CATALOGS.md`.
