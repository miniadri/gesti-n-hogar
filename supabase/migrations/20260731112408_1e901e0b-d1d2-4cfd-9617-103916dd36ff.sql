ALTER TABLE public.sos_events ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.sos_events.is_test IS 'Indica si el SOS es un simulacro de prueba';