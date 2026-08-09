UPDATE public.stores
SET is_enabled = false
WHERE official_source = 'carrefour'
  AND is_enabled = true;
