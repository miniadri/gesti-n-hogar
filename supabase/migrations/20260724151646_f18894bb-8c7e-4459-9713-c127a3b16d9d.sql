
SELECT cron.unschedule('medication-reminders-every-min');
SELECT cron.schedule(
  'medication-reminders-every-min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app/api/public/hooks/medication-reminders',
    headers := '{"Content-Type":"application/json","apikey":"sb_publishable_e1yZR76WKFAJrdFNJLynWQ_kEI7_Bof"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
