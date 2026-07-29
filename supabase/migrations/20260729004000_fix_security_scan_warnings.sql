-- Security scan hardening.
-- Keep Telegram link tokens private and restrict direct execution of
-- SECURITY DEFINER helpers to the roles that actually need them.

-- Telegram pending links contain one-time account-linking tokens. They are
-- created and consumed by trusted server code through the service role; normal
-- authenticated users must not be able to list or read them.
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.telegram_pending_links FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.telegram_pending_links TO service_role;

DROP POLICY IF EXISTS "Users can delete their own pending links" ON public.telegram_pending_links;
DROP POLICY IF EXISTS "Users can read pending links by token" ON public.telegram_pending_links;
DROP POLICY IF EXISTS "Service role can manage pending links" ON public.telegram_pending_links;

CREATE POLICY "Service role can manage pending links"
  ON public.telegram_pending_links
  FOR ALL
  TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Avoid RLS "always true" warnings while preserving the intended global,
-- authenticated product catalog read access.
DROP POLICY IF EXISTS "Authenticated can read products" ON public.products;
CREATE POLICY "Authenticated can read products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- SECURITY DEFINER functions should not be executable by PUBLIC/anon. Grant
-- only the authenticated app role where direct RPC calls are expected.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_household() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_household_contributions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_medication_due_intakes(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_member_schedule(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_member_schedule(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_household() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_household_contributions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_medication_due_intakes(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_member_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_member_schedule(uuid, boolean) TO authenticated;

-- Trigger-only SECURITY DEFINER functions should not be callable directly.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_default_household() FROM PUBLIC, anon, authenticated;
