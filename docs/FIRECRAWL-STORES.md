# Prueba Firecrawl de catálogos de supermercados (Experimental)

Módulo **aislado** en `Ajustes → Experimental` para comprobar si se pueden leer precios de las cadenas que bloquean las peticiones directas del servidor (Carrefour, Eroski, El Corte Inglés/Hipercor, Alcampo, MAS, Caprabo).

No toca nada del flujo actual de **Lista de compra** ni **Inventario**.

## Por qué existe

Las APIs abiertas (Mercadona, Día, Consum) responden bien desde el servidor. Las demás cadenas devuelven `403`, `503` o HTML de Cloudflare/Akamai porque bloquean el tráfico de centros de datos. Firecrawl usa un navegador real con proxy *stealth* y permite comprobar, con coste medido, qué cadenas son viables.

## Criterios de diseño

- **Pocos términos**: máximo 3 por ejecución (separados por comas).
- **Ejecución manual**: no hay cron ni llamadas automáticas.
- **Coste visible**: se muestra el coste estimado antes de ejecutar (~9 créditos por página) y el gasto real + saldo restante después.
- **Sin persistencia**: los resultados solo viven en pantalla; no se escribe en la base de datos.
- **Sin dependencias**: ningún otro módulo importa este código.

## Archivos creados

| Archivo | Función |
|---|---|
| `src/lib/firecrawl-stores.server.ts` | URLs de búsqueda por cadena, llamada a la API de Firecrawl (`/v2/scrape` con extracción JSON), consulta de saldo (`/v2/team/credit-usage`), normalización de productos. |
| `src/lib/firecrawl-stores.functions.ts` | Server functions autenticadas `probeFirecrawlStoreCatalogs` (máx. 3 términos × 6 tiendas) y `getFirecrawlCreditBalance`. |
| `src/components/FirecrawlStoreExperiment.tsx` | Tarjeta de la interfaz: términos, selección de tiendas, contador de créditos, resultados con foto, precio, precio por unidad y enlace. |

Modificado únicamente `src/routes/_authenticated.settings.experimental.tsx` para incluir la tarjeta. No se ha renombrado ningún archivo.

## Cómo se usa

1. Entra en `Ajustes → Experimental`.
2. Escribe uno a tres términos (por ejemplo `leche, pañales`).
3. Marca las tiendas a probar.
4. Revisa el coste estimado y pulsa **Ejecutar prueba**.
5. Cada tarjeta de resultado indica estado, HTTP, tiempo, créditos consumidos y los productos extraídos.

Estados posibles:

- **OK**: se extrajeron productos.
- **Sin resultados**: la página cargó pero no había productos para ese término.
- **Bloqueado**: la tienda respondió 403/429/5xx incluso con navegador real.
- **Error**: fallo de red o de la API de Firecrawl.

## Resultados de la primera validación (agosto 2026)

- **Eroski**: extracción correcta (nombre, marca, precio, precio por litro, imagen y enlace).
- **Carrefour**: `503` incluso en modo stealth. No viable por ahora.
- Resto de cadenas: pendiente de medir desde el panel.

## Requisitos

- Conector **Firecrawl** enlazado al proyecto (secreto `FIRECRAWL_API_KEY`, modo API directa).
- Acceso restringido: la pantalla Experimental solo la ve el correo administrador configurado en la ruta.

## Siguiente paso (solo si se valida)

Si una cadena resulta estable y su uso es aceptable legalmente (revisar términos de uso y `robots.txt` de cada web), el siguiente paso sería una tabla de caché con histórico de precios y un refresco programado, conectado a la búsqueda de Lista de compra. Nada de eso está implementado todavía.
