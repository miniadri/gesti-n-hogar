
-- =============== PRODUCTS (global catalog) ===============
CREATE TABLE public.products (
  ean TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  size_value NUMERIC(10,3),
  size_unit TEXT,
  image_url TEXT,
  default_location TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read products"
  ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert products"
  ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update products"
  ON public.products FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============== PRODUCT PRICES (per household, per store) ===============
CREATE TABLE public.product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  product_ean TEXT NOT NULL REFERENCES public.products(ean) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  last_price NUMERIC(10,2),
  last_quantity NUMERIC(10,3),
  last_unit TEXT,
  price_per_kg NUMERIC(10,2),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, product_ean, store_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_prices TO authenticated;
GRANT ALL ON public.product_prices TO service_role;

ALTER TABLE public.product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can manage product_prices"
  ON public.product_prices FOR ALL TO authenticated
  USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE TRIGGER product_prices_updated_at
  BEFORE UPDATE ON public.product_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_product_prices_household_ean
  ON public.product_prices (household_id, product_ean);

-- =============== INVENTORY: link to products by EAN ===============
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS ean TEXT REFERENCES public.products(ean) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_household_ean
  ON public.inventory_items (household_id, ean);
