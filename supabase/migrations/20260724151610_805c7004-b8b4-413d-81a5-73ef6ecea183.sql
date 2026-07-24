
-- Fix push-scheduler URL to use the stable -dev host (project isn't published)
SELECT cron.unschedule('push-scheduler-every-5min');
SELECT cron.schedule(
  'push-scheduler-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app/api/public/hooks/push-scheduler',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_e1yZR76WKFAJrdFNJLynWQ_kEI7_Bof"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Add medication reminders cron (every minute; endpoint checks 5-min throttle)
SELECT cron.schedule(
  'medication-reminders-every-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app/api/public/hooks/medication-reminders',
    headers := ('{"Content-Type":"application/json","Authorization":"Bearer ' || current_setting('app.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  );
  $$
);
