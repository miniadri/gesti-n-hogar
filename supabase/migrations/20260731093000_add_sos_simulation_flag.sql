ALTER TABLE public.sos_events
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sos_events_household_created_real_idx
  ON public.sos_events (household_id, created_at DESC)
  WHERE is_test = false;
