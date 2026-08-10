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

UPDATE public.stores s
SET official_source = source.official_source,
    is_enabled = COALESCE(s.is_enabled, true)
FROM (
  VALUES
    ('Mercadona', 'mercadona'),
    ('Día', 'dia'),
    ('Dia', 'dia'),
    ('Consum', 'consum'),
    ('Carrefour', 'carrefour')
) AS source(name, official_source)
WHERE s.official_source IS NULL
  AND lower(s.name) = lower(source.name);

INSERT INTO public.stores (household_id, name, official_source, is_enabled, is_default)
SELECT h.id, source.name, source.official_source, source.is_enabled, false
FROM public.households h
CROSS JOIN (
  VALUES
    ('Mercadona', 'mercadona', true),
    ('Día', 'dia', true),
    ('Consum', 'consum', true),
    ('Carrefour', 'carrefour', false)
) AS source(name, official_source, is_enabled)
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
WHERE s.official_source IN ('mercadona', 'dia', 'consum', 'carrefour')
  AND NOT EXISTS (
    SELECT 1
    FROM public.shopping_lists l
    WHERE l.household_id = s.household_id
      AND l.store_id = s.id
      AND l.is_archived = false
  );

UPDATE public.stores
SET is_enabled = false
WHERE official_source = 'carrefour'
  AND is_enabled = true;

CREATE TABLE IF NOT EXISTS public.store_scrape_providers (
  provider_key text PRIMARY KEY,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  secret_name text,
  weekly_budget_credits integer NOT NULL DEFAULT 0 CHECK (weekly_budget_credits >= 0),
  monthly_budget_credits integer NOT NULL DEFAULT 0 CHECK (monthly_budget_credits >= 0),
  estimated_credits_per_query numeric NOT NULL DEFAULT 0 CHECK (estimated_credits_per_query >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_catalog_source_settings (
  store_key text PRIMARY KEY,
  store_name text NOT NULL,
  mode text NOT NULL DEFAULT 'external' CHECK (mode IN ('live', 'cached', 'external')),
  enabled boolean NOT NULL DEFAULT false,
  preferred_provider_key text REFERENCES public.store_scrape_providers(provider_key) ON DELETE SET NULL,
  weekly_term_limit integer NOT NULL DEFAULT 0 CHECK (weekly_term_limit >= 0),
  priority_weight integer NOT NULL DEFAULT 10 CHECK (priority_weight BETWEEN 0 AND 100),
  external_search_url_template text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_catalog_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term text NOT NULL,
  normalized_term text NOT NULL UNIQUE,
  search_count integer NOT NULL DEFAULT 0 CHECK (search_count >= 0),
  inventory_count integer NOT NULL DEFAULT 0 CHECK (inventory_count >= 0),
  shopping_count integer NOT NULL DEFAULT 0 CHECK (shopping_count >= 0),
  last_searched_at timestamptz,
  last_added_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_catalog_refresh_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id uuid NOT NULL REFERENCES public.store_catalog_terms(id) ON DELETE CASCADE,
  store_key text NOT NULL REFERENCES public.store_catalog_source_settings(store_key) ON DELETE CASCADE,
  provider_key text REFERENCES public.store_scrape_providers(provider_key) ON DELETE SET NULL,
  priority_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'paused', 'running', 'succeeded', 'failed', 'skipped')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  estimated_credits integer NOT NULL DEFAULT 0 CHECK (estimated_credits >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, store_key)
);

CREATE TABLE IF NOT EXISTS public.store_catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL REFERENCES public.store_catalog_source_settings(store_key) ON DELETE CASCADE,
  provider_key text REFERENCES public.store_scrape_providers(provider_key) ON DELETE SET NULL,
  query_term text,
  external_id text,
  ean text,
  name text NOT NULL,
  brand text,
  category text,
  image_url text,
  product_url text,
  price numeric,
  reference_price numeric,
  reference_format text,
  packaging text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_catalog_products_store_external_idx
  ON public.store_catalog_products (store_key, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS store_catalog_products_lookup_idx
  ON public.store_catalog_products (store_key, lower(name), captured_at DESC)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.store_catalog_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_catalog_product_id uuid NOT NULL REFERENCES public.store_catalog_products(id) ON DELETE CASCADE,
  store_key text NOT NULL,
  provider_key text,
  price numeric,
  reference_price numeric,
  reference_format text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_catalog_price_history_product_idx
  ON public.store_catalog_price_history (store_catalog_product_id, captured_at DESC);

INSERT INTO public.store_scrape_providers (
  provider_key,
  name,
  enabled,
  secret_name,
  weekly_budget_credits,
  monthly_budget_credits,
  estimated_credits_per_query,
  notes
)
VALUES
  ('firecrawl', 'Firecrawl', true, 'FIRECRAWL_API_KEY', 180, 720, 9, 'Proveedor inicial para Alcampo. Ya existe experimento manual.'),
  ('apify', 'Apify', false, 'APIFY_API_TOKEN', 120, 480, 6, 'Candidato para El Corte Inglés / Hipercor con actor configurable.'),
  ('scrapingbee', 'ScrapingBee', false, 'SCRAPINGBEE_API_KEY', 100, 400, 5, 'Candidato para Eroski. Medir coste real por búsqueda.'),
  ('scraperapi', 'ScraperAPI', false, 'SCRAPERAPI_KEY', 80, 320, 4, 'Candidato para MAS u otras tiendas medianas.'),
  ('scrapedo', 'Scrape.do', false, 'SCRAPEDO_TOKEN', 80, 320, 4, 'Candidato para Caprabo u otras tiendas.'),
  ('brightdata', 'Bright Data', false, 'BRIGHTDATA_API_TOKEN', 0, 0, 0, 'Reservado para Carrefour si se decide usar proveedor profesional.')
ON CONFLICT (provider_key) DO UPDATE
SET name = EXCLUDED.name,
    secret_name = EXCLUDED.secret_name,
    notes = EXCLUDED.notes,
    updated_at = now();

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
  ('mercadona', 'Mercadona', 'live', true, null, 0, 100, 'https://tienda.mercadona.es/search-results?query={{query}}', 'Catálogo vivo. No usa proveedor externo.'),
  ('dia', 'Día', 'live', true, null, 0, 90, 'https://www.dia.es/search?q={{query}}', 'Catálogo vivo. No usa proveedor externo.'),
  ('consum', 'Consum', 'live', true, null, 0, 80, 'https://tienda.consum.es/es/search?q={{query}}', 'Catálogo vivo. No usa proveedor externo.'),
  ('alcampo', 'Alcampo', 'cached', true, 'firecrawl', 5, 75, 'https://www.compraonline.alcampo.es/search?q={{query}}', 'Prioridad alta para hogares con Alcampo cerca.'),
  ('el_corte_ingles', 'El Corte Inglés / Hipercor', 'cached', true, 'apify', 3, 55, 'https://www.elcorteingles.es/supermercado/buscar/?term={{query}}', 'Cacheado; prioridad media.'),
  ('eroski', 'Eroski', 'cached', true, 'scrapingbee', 3, 40, 'https://supermercado.eroski.es/es/search/results/?q={{query}}', 'Cacheado; despriorizar en hogares sin tienda cercana.'),
  ('mas', 'MAS', 'cached', true, 'scraperapi', 2, 25, 'https://www.supermercadosmas.com/catalogsearch/result/?q={{query}}', 'Cacheado con límite bajo.'),
  ('caprabo', 'Caprabo', 'cached', true, 'scrapedo', 2, 20, 'https://www.capraboacasa.com/es/search?text={{query}}', 'Cacheado con límite bajo.'),
  ('carrefour', 'Carrefour', 'external', false, 'brightdata', 0, 30, 'https://www.carrefour.es/?query={{query}}', 'De momento enlace externo; reservar proveedor si se valida coste/estabilidad.')
ON CONFLICT (store_key) DO UPDATE
SET store_name = EXCLUDED.store_name,
    external_search_url_template = EXCLUDED.external_search_url_template,
    notes = EXCLUDED.notes,
    updated_at = now();

ALTER TABLE public.store_scrape_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog_source_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog_refresh_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read store scrape providers" ON public.store_scrape_providers;
CREATE POLICY "Authenticated users can read store scrape providers"
  ON public.store_scrape_providers FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can read store catalog source settings" ON public.store_catalog_source_settings;
CREATE POLICY "Authenticated users can read store catalog source settings"
  ON public.store_catalog_source_settings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can read store catalog terms" ON public.store_catalog_terms;
CREATE POLICY "Authenticated users can read store catalog terms"
  ON public.store_catalog_terms FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can read store catalog refresh queue" ON public.store_catalog_refresh_queue;
CREATE POLICY "Authenticated users can read store catalog refresh queue"
  ON public.store_catalog_refresh_queue FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can read store catalog products" ON public.store_catalog_products;
CREATE POLICY "Authenticated users can read store catalog products"
  ON public.store_catalog_products FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated users can read store catalog price history" ON public.store_catalog_price_history;
CREATE POLICY "Authenticated users can read store catalog price history"
  ON public.store_catalog_price_history FOR SELECT
  TO authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.store_scrape_providers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_catalog_source_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_catalog_terms FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_catalog_refresh_queue FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_catalog_products FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.store_catalog_price_history FROM anon, authenticated;

GRANT SELECT ON public.store_scrape_providers TO authenticated;
GRANT SELECT ON public.store_catalog_source_settings TO authenticated;
GRANT SELECT ON public.store_catalog_terms TO authenticated;
GRANT SELECT ON public.store_catalog_refresh_queue TO authenticated;
GRANT SELECT ON public.store_catalog_products TO authenticated;
GRANT SELECT ON public.store_catalog_price_history TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_scrape_providers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_catalog_source_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_catalog_terms TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_catalog_refresh_queue TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_catalog_products TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_catalog_price_history TO service_role;
