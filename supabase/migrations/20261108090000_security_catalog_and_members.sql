-- Security follow-up for v0.96.
-- Recrea el trigger de protección is_child
CREATE OR REPLACE FUNCTION public.prevent_member_role_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_child IS DISTINCT FROM OLD.is_child
     AND NOT public.is_household_admin(OLD.household_id, auth.uid()) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la clasificación del miembro';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS prevent_member_role_escalation ON public.household_members;
CREATE TRIGGER prevent_member_role_escalation BEFORE UPDATE OF is_child
ON public.household_members FOR EACH ROW
EXECUTE FUNCTION public.prevent_member_role_escalation();

-- Products: lectura solo para miembros de algún hogar, escritura solo service_role
DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can update products" ON public.products;
DROP POLICY IF EXISTS "Users can insert products as themselves" ON public.products;
DROP POLICY IF EXISTS "Household members can read products" ON public.products;

CREATE POLICY "Household members can read products" ON public.products
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.household_members m WHERE m.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon, authenticated;

-- Eliminar políticas antiguas de catálogos
DO $$
DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'store_scrape_providers','store_catalog_refresh_queue',
    'store_catalog_source_settings','store_catalog_price_history',
    'store_catalog_terms','store_catalog_products',
    'mercadona_products','mercadona_price_history'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Nuevas políticas estrictas para catálogos
CREATE POLICY "Household members read catalog terms" ON public.store_catalog_terms
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.household_members m WHERE m.user_id = auth.uid()));
CREATE POLICY "Household members read catalog products" ON public.store_catalog_products
  FOR SELECT TO authenticated USING (is_active AND EXISTS (SELECT 1 FROM public.household_members m WHERE m.user_id = auth.uid()));
CREATE POLICY "Household members read catalog price history" ON public.store_catalog_price_history
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.household_members m WHERE m.user_id = auth.uid()));
CREATE POLICY "Household members read Mercadona products" ON public.mercadona_products
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.household_members m WHERE m.user_id = auth.uid()));
CREATE POLICY "Household members read Mercadona prices" ON public.mercadona_price_history
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.household_members m WHERE m.user_id = auth.uid()));

REVOKE ALL ON public.store_scrape_providers, public.store_catalog_refresh_queue,
  public.store_catalog_source_settings FROM anon, authenticated;
GRANT SELECT ON public.store_catalog_terms, public.store_catalog_products,
  public.store_catalog_price_history, public.mercadona_products,
  public.mercadona_price_history TO authenticated;
