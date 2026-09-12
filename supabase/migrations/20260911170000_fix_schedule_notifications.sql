-- HomeSync v0.76: restore the Cuadrante scheduler on the external
-- Cloudflare deployment and allow a notification at the actual start time.
-- The existing cron_bearer secret in Supabase Vault must match CRON_BEARER in
-- Cloudflare Pages. This migration never stores that secret in source control.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

ALTER TABLE public.schedule_notification_log
  DROP CONSTRAINT IF EXISTS schedule_notification_log_notice_type_check;

ALTER TABLE public.schedule_notification_log
  ADD CONSTRAINT schedule_notification_log_notice_type_check
  CHECK (notice_type IN ('start_60', 'start_30', 'start_now', 'ended'));

DO $$
DECLARE
  bearer text;
  existing record;
BEGIN
  SELECT decrypted_secret INTO bearer
  FROM vault.decrypted_secrets
  WHERE name = 'cron_bearer'
  LIMIT 1;

  IF bearer IS NULL OR bearer = '' OR bearer = 'REPLACE_WITH_CRON_BEARER' THEN
    RAISE EXCEPTION 'cron_bearer secret missing from Supabase Vault';
  END IF;

  FOR existing IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('push-scheduler-every-5min', 'homesync-push-scheduler-every-5min')
  LOOP
    PERFORM cron.unschedule(existing.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'homesync-push-scheduler-every-5min',
    '*/5 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://gestion-hogar.pages.dev/api/public/hooks/push-scheduler',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'cron_bearer'
            LIMIT 1
          )
        ),
        body := '{}'::jsonb
      );
    $job$
  );
END $$;
