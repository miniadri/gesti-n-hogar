ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_devices_household_hidden ON public.devices(household_id, hidden);