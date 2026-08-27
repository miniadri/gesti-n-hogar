ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;
UPDATE public.stores SET sort_order = 0 WHERE is_default IS TRUE OR name = 'Sin tienda';