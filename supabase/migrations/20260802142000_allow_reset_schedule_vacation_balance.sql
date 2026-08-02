ALTER TABLE public.schedule_settings
ADD COLUMN IF NOT EXISTS vacation_balance_adjustment numeric(6,2) NOT NULL DEFAULT 0;

ALTER TABLE public.schedule_settings
ALTER COLUMN vacation_start_date DROP NOT NULL;

ALTER TABLE public.schedule_settings
ALTER COLUMN vacation_start_date DROP DEFAULT;

ALTER TABLE public.schedule_settings
ALTER COLUMN vacation_days_per_month SET DEFAULT 0;
