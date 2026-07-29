
-- 1) telegram_pending_links: remove overly-permissive policies and revoke direct access.
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

-- 2) Revoke EXECUTE on SECURITY DEFINER helpers from PUBLIC/anon.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_household() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_household_contributions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_medication_due_intakes(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_member_schedule(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_member_schedule(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_default_household() FROM PUBLIC, anon, authenticated;

-- Authenticated users legitimately call these via the app (RLS helpers + RPCs).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_household() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_household_contributions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_medication_due_intakes(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_member_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_member_schedule(uuid, boolean) TO authenticated;

-- 3) Reschedule cron jobs to authenticate with a private bearer token from vault.
DO $$
DECLARE
  bearer text;
BEGIN
  SELECT decrypted_secret INTO bearer FROM vault.decrypted_secrets WHERE name = 'cron_bearer' LIMIT 1;
  IF bearer IS NULL THEN
    RAISE EXCEPTION 'cron_bearer secret missing from vault';
  END IF;

  PERFORM cron.unschedule(jobname)
    FROM cron.job
    WHERE jobname IN (
      'push-scheduler-every-5min',
      'medication-reminders-every-min',
      'google-calendar-sync-hourly'
    );

  PERFORM cron.schedule(
    'push-scheduler-every-5min',
    '*/5 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app/api/public/hooks/push-scheduler',
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $job$, jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||bearer)::text)
  );

  PERFORM cron.schedule(
    'medication-reminders-every-min',
    '* * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app/api/public/hooks/medication-reminders',
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $job$, jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||bearer)::text)
  );

  PERFORM cron.schedule(
    'google-calendar-sync-hourly',
    '0 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app/api/public/hooks/google-calendar-sync',
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $job$, jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||bearer)::text)
  );
END $$;
