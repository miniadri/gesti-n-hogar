# Lista de compra: acciones flotantes, categorías automáticas y prioridad

## 1. Bloque flotante "+Añadir" / "Tarjetas"
- En `/shopping`, los cuatro botones actuales siguen en la cabecera.
- Se añade un bloque flotante (fijo abajo a la derecha, por encima del contenido) con solo **+ Añadir** y **Tarjetas**, visible al hacer scroll y siempre accesible.
- Aparece cuando la cabecera deja de estar visible al bajar; respeta la barra de navegación inferior en móvil.
- "Gestionar tiendas" y "Escanear ticket" quedan solo en la cabecera.

## 2. Categoría automática y agrupación por categoría
- Al añadir un producto sin tocar el selector de categoría, se deduce automáticamente:
  1. Categoría del catálogo de la tienda (Mercadona, Día, Consum, Carrefour) mapeada a las categorías de la app.
  2. Si no hay coincidencia, deducción por palabras clave del nombre (leche → Lácteos, congelado → Congelados, etc.).
  3. Si nada encaja, "Otros".
- En el diálogo, la categoría se muestra como "Automática" hasta que el usuario elija una manualmente.
- La lista se agrupa: **tienda → categoría → productos**. Cada tienda muestra sus categorías con su icono y contador; las categorías se ordenan de forma fija y coherente, con "Otros" al final.

## 3. Etiqueta de prioridad
- Nuevo campo al añadir producto: **Urgente**, **Normal** (por defecto), **Sin prisa**.
- Dentro de cada categoría, el orden es: urgentes primero, luego normales, luego sin prisa (y dentro de cada grupo, por nombre).
- Cada tarjeta de producto muestra un distintivo de prioridad (solo para urgente y sin prisa, para no saturar).
- La prioridad se puede cambiar desde la propia tarjeta del producto.

## Detalles técnicos
- **Migración SQL** (te indicaré el nombre exacto del archivo al generarla, en `supabase/migrations/`):
  `ALTER TABLE public.shopping_list_items ADD COLUMN priority text NOT NULL DEFAULT 'normal'` con `CHECK (priority IN ('urgente','normal','sin_prisa'))`.
- `src/lib/shopping.functions.ts`: aceptar `priority` en crear/actualizar producto; nueva acción para cambiar prioridad.
- Nuevo helper `src/lib/shopping-categories.ts`: mapeo de categorías de catálogo y reglas por palabra clave (reutilizable y testeable).
- `src/routes/_authenticated.shopping.index.tsx`: bloque flotante, agrupación por categoría dentro de cada tienda, orden por prioridad, selector de prioridad en el diálogo y en la tarjeta.
- No se renombran archivos existentes.
