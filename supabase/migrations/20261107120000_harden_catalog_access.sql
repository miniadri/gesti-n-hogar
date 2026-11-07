-- Catalog data may be read by authenticated users; provider credentials and
-- refresh operations are restricted to the explicitly authorized admin.
ALTER TABLE public.store_scrape_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog_refresh_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_catalog_source_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read provider settings" ON public.store_scrape_providers;
DROP POLICY IF EXISTS "authenticated can read refresh queue" ON public.store_catalog_refresh_queue;
DROP POLICY IF EXISTS "authenticated can read source settings" ON public.store_catalog_source_settings;

CREATE POLICY "catalog admins can read provider settings"
  ON public.store_scrape_providers FOR SELECT TO authenticated
  USING (public.is_household_admin((SELECT public.current_household()), auth.uid()));

CREATE POLICY "catalog admins can read refresh queue"
  ON public.store_catalog_refresh_queue FOR SELECT TO authenticated
  USING (public.is_household_admin((SELECT public.current_household()), auth.uid()));

CREATE POLICY "catalog admins can read source settings"
  ON public.store_catalog_source_settings FOR SELECT TO authenticated
  USING (public.is_household_admin((SELECT public.current_household()), auth.uid()));
