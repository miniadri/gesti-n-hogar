ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal';

ALTER TABLE public.shopping_list_items
  DROP CONSTRAINT IF EXISTS shopping_list_items_priority_check;

ALTER TABLE public.shopping_list_items
  ADD CONSTRAINT shopping_list_items_priority_check
  CHECK (priority IN ('urgente', 'normal', 'sin_prisa'));