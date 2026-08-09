CREATE TABLE IF NOT EXISTS public.mercadona_products (
  id text PRIMARY KEY,
  ean text,
  display_name text NOT NULL,
  brand text,
  slug text,
  thumbnail text,
  share_url text,
  category text,
  unit_price numeric,
  bulk_price numeric,
  reference_price numeric,
  reference_format text,
  unit_name text,
  unit_size numeric,
  is_pack boolean DEFAULT false,
  packaging text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.mercadona_products TO authenticated;
GRANT ALL ON public.mercadona_products TO service_role;
ALTER TABLE public.mercadona_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read mercadona catalog"
  ON public.mercadona_products FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.mercadona_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL REFERENCES public.mercadona_products(id) ON DELETE CASCADE,
  captured_on date NOT NULL DEFAULT current_date,
  unit_price numeric,
  bulk_price numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, captured_on)
);

GRANT SELECT ON public.mercadona_price_history TO authenticated;
GRANT ALL ON public.mercadona_price_history TO service_role;
ALTER TABLE public.mercadona_price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read mercadona price history"
  ON public.mercadona_price_history FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_mercadona_price_history_product ON public.mercadona_price_history(product_id, captured_on DESC);

ALTER TABLE public.shopping_list_items ADD COLUMN IF NOT EXISTS mercadona_id text;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS mercadona_id text;