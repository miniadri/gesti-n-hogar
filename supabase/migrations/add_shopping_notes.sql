-- Añade la columna de detalles opcionales a los productos de la lista de la compra.
ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS notes text;
