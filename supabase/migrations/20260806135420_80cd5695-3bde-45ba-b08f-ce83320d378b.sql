-- 1. app_user_connections: RLS enabled but no policy. Make the denial explicit.
CREATE POLICY "No direct client access to app_user_connections"
  ON public.app_user_connections
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- 2. Maintenance-only SECURITY DEFINER function must not be callable by signed-in users.
REVOKE EXECUTE ON FUNCTION public.cleanup_household_activity_retention() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_household_activity_retention() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_household_activity_retention() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_household_activity_retention() TO service_role;