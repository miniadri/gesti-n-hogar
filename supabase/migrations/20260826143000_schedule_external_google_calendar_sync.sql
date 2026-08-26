-- Schedule Google Calendar imports for the external Cloudflare deployment.
--
-- Before running this migration, replace REPLACE_WITH_CRON_BEARER with the same
-- CRON_BEARER value configured in Cloudflare Pages. Do not commit or share the
-- filled-in token.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

DO $$
DECLARE
  existing_secret_id uuid;
BEGIN
  SELECT id INTO existing_secret_id
  FROM vault.decrypted_secrets
  WHERE name = 'cron_bearer'
  LIMIT 1;

  IF existing_secret_id IS NOT NULL THEN
    PERFORM vault.update_secret(
      existing_secret_id,
      'REPLACE_WITH_CRON_BEARER',
      'cron_bearer',
      'HomeSync cron bearer token'
    );
  ELSE
    PERFORM vault.create_secret(
      'REPLACE_WITH_CRON_BEARER',
      'cron_bearer',
      'HomeSync cron bearer token'
    );
  END IF;
END $$;

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
    RAISE EXCEPTION 'Replace REPLACE_WITH_CRON_BEARER with your real CRON_BEARER before running this migration';
  END IF;

  FOR existing IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN ('google-calendar-sync-hourly', 'homesync-google-calendar-sync-hourly')
  LOOP
    PERFORM cron.unschedule(existing.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'homesync-google-calendar-sync-hourly',
    '0 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://gestion-hogar.pages.dev/api/public/hooks/google-calendar-sync',
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
