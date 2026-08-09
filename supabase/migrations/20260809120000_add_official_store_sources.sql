ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS official_source text,
ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS stores_household_official_source_idx
  ON public.stores (household_id, official_source)
  WHERE official_source IS NOT NULL;

UPDATE public.stores
SET official_source = 'mercadona',
    is_enabled = true
WHERE lower(name) = 'mercadona'
  AND official_source IS NULL;

INSERT INTO public.stores (household_id, name, official_source, is_enabled, is_default)
SELECT h.id, 'Mercadona', 'mercadona', true, false
FROM public.households h
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stores s
  WHERE s.household_id = h.id
    AND s.official_source = 'mercadona'
);

INSERT INTO public.shopping_lists (household_id, store_id, name)
SELECT s.household_id, s.id, s.name
FROM public.stores s
WHERE s.official_source = 'mercadona'
  AND NOT EXISTS (
    SELECT 1
    FROM public.shopping_lists l
    WHERE l.household_id = s.household_id
      AND l.store_id = s.id
      AND l.is_archived = false
  );
