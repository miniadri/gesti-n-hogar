ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS official_source text,
ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS stores_household_official_source_idx
  ON public.stores (household_id, official_source)
  WHERE official_source IS NOT NULL;

ALTER TABLE public.shopping_list_items
ADD COLUMN IF NOT EXISTS store_product_source text,
ADD COLUMN IF NOT EXISTS store_product_id text,
ADD COLUMN IF NOT EXISTS store_product_url text,
ADD COLUMN IF NOT EXISTS store_product_brand text;

CREATE INDEX IF NOT EXISTS shopping_list_items_store_product_idx
  ON public.shopping_list_items (store_product_source, store_product_id)
  WHERE store_product_source IS NOT NULL AND store_product_id IS NOT NULL;

UPDATE public.stores s
SET official_source = source.official_source,
    is_enabled = COALESCE(s.is_enabled, true)
FROM (
  VALUES
    ('Día', 'dia'),
    ('Dia', 'dia'),
    ('Carrefour', 'carrefour')
) AS source(name, official_source)
WHERE s.official_source IS NULL
  AND lower(s.name) = lower(source.name);

INSERT INTO public.stores (household_id, name, official_source, is_enabled, is_default)
SELECT h.id, source.name, source.official_source, true, false
FROM public.households h
CROSS JOIN (
  VALUES
    ('Día', 'dia'),
    ('Carrefour', 'carrefour')
) AS source(name, official_source)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stores s
  WHERE s.household_id = h.id
    AND (
      s.official_source = source.official_source
      OR lower(s.name) = lower(source.name)
    )
);

INSERT INTO public.shopping_lists (household_id, store_id, name)
SELECT s.household_id, s.id, s.name
FROM public.stores s
WHERE s.official_source IN ('dia', 'carrefour')
  AND NOT EXISTS (
    SELECT 1
    FROM public.shopping_lists l
    WHERE l.household_id = s.household_id
      AND l.store_id = s.id
      AND l.is_archived = false
  );
