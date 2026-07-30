SELECT cron.schedule(
  'sos-reminders-every-min',
  '* * * * *',
  $$
      SELECT net.http_post(
        url := 'https://project--8f67b433-144a-485c-9cd2-9ae50733f9b1-dev.lovable.app/api/public/hooks/sos-reminders',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer fb63f3e66a378cbde6355492f59d053f26ad6eaf14f878226a28872bc9af9c3d"}'::jsonb,
        body := '{}'::jsonb
      );
  $$
);