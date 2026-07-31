ALTER TABLE public.sos_events
  ADD COLUMN IF NOT EXISTS sos_type text NOT NULL DEFAULT 'urgency',
  ADD COLUMN IF NOT EXISTS battery_level numeric(5,2),
  ADD COLUMN IF NOT EXISTS battery_charging boolean,
  ADD COLUMN IF NOT EXISTS connection_type text,
  ADD COLUMN IF NOT EXISTS location_source text,
  ADD COLUMN IF NOT EXISTS last_known_location_used boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

ALTER TABLE public.sos_events
  DROP CONSTRAINT IF EXISTS sos_events_sos_type_check,
  ADD CONSTRAINT sos_events_sos_type_check
    CHECK (sos_type IN ('urgency', 'medical', 'fall', 'unsafe', 'other'));

ALTER TABLE public.sos_events
  DROP CONSTRAINT IF EXISTS sos_events_location_source_check,
  ADD CONSTRAINT sos_events_location_source_check
    CHECK (location_source IS NULL OR location_source IN ('precise', 'fallback', 'last_known', 'none'));

CREATE INDEX IF NOT EXISTS sos_events_active_idx
  ON public.sos_events (household_id, created_at DESC)
  WHERE acknowledged_at IS NULL AND cancelled_at IS NULL AND is_test = false;
