-- Security follow-up for v0.96.
-- Run once after the v0.95 migration. This removes the original permissive
-- catalog policies; adding a stricter policy alone would still leave the old
-- policy effective because permissive policies are combined with OR.

-- The v0.95 trigger is the protection for is_child. Recreate it here too so
-- this migration is independently safe when v0.95 was not applied.
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

-- Products: authenticated household members may read the global catalogue,
-- but only the service role may write it. The app's server code already uses
-- service_role for catalogue ingestion.
DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can insert products" ON public.products;
DROP POLICY IF EXISTS "Authenticated can update products" ON public.products;
DROP POLICY IF EXISTS "Users can insert products as themselves" ON public.products;
CREATE POLICY "Household members can read products" ON public.products
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.household_members m WHERE m.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon, authenticated;

-- Remove the old broad catalog policies, including policies from earlier
-- migrations whose names differ between environments.
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

-- Catalog data is readable only by signed-in members of at least one
-- household. Provider credentials and refresh queue are server-only.
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
