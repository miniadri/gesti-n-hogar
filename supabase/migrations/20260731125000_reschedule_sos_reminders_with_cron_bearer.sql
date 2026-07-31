-- Recreate the SOS reminder cron using the active private bearer from Supabase Vault.
-- Older versions of this job used a hardcoded bearer, so the endpoint can reject
-- reminder calls after the app moved to CRON_BEARER.

DO $$
DECLARE
  bearer text;
  target_url text := 'https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app/api/public/hooks/sos-reminders';
  existing_url text;
  existing_job record;
BEGIN
  SELECT decrypted_secret
    INTO bearer
    FROM vault.decrypted_secrets
    WHERE name = 'cron_bearer'
    LIMIT 1;

  IF bearer IS NULL OR length(trim(bearer)) = 0 THEN
    RAISE EXCEPTION 'cron_bearer secret missing from vault';
  END IF;

  SELECT (regexp_match(command, $$url\s*:=\s*'([^']+)'$$))[1]
    INTO existing_url
    FROM cron.job
    WHERE jobname = 'sos-reminders-every-min'
    LIMIT 1;

  IF existing_url IS NOT NULL AND length(trim(existing_url)) > 0 THEN
    target_url := existing_url;
  END IF;

  FOR existing_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'sos-reminders-every-min'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'sos-reminders-every-min',
    '* * * * *',
    format($job$
      SELECT net.http_post(
        url := %L,
        headers := %L::jsonb,
        body := '{}'::jsonb
      );
    $job$, target_url, jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || bearer
    )::text)
  );
END $$;
