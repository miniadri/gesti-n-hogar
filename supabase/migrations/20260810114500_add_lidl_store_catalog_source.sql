INSERT INTO public.store_catalog_source_settings (
  store_key,
  store_name,
  mode,
  enabled,
  preferred_provider_key,
  weekly_term_limit,
  priority_weight,
  external_search_url_template,
  notes
)
VALUES
  (
    'lidl',
    'Lidl',
    'cached',
    true,
    'scrapedo',
    2,
    35,
    'https://www.lidl.es/search?query={{query}}',
    'Cacheado experimental; validar proveedor y calidad antes de activar capturas automáticas.'
  )
ON CONFLICT (store_key) DO UPDATE
SET store_name = EXCLUDED.store_name,
    mode = CASE
      WHEN public.store_catalog_source_settings.mode = 'external' THEN EXCLUDED.mode
      ELSE public.store_catalog_source_settings.mode
    END,
    enabled = public.store_catalog_source_settings.enabled,
    preferred_provider_key = COALESCE(public.store_catalog_source_settings.preferred_provider_key, EXCLUDED.preferred_provider_key),
    weekly_term_limit = GREATEST(public.store_catalog_source_settings.weekly_term_limit, EXCLUDED.weekly_term_limit),
    priority_weight = GREATEST(public.store_catalog_source_settings.priority_weight, EXCLUDED.priority_weight),
    external_search_url_template = EXCLUDED.external_search_url_template,
    notes = EXCLUDED.notes,
    updated_at = now();
