ALTER TABLE public.schedule_settings
ADD COLUMN IF NOT EXISTS vacation_balance_adjustment numeric(6,2) NOT NULL DEFAULT 0;
