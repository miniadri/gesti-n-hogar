ALTER TABLE public.sos_events
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.sos_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sos_event_id uuid NOT NULL REFERENCES public.sos_events(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id text,
  recipient_name text,
  channel text,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sos_ack_event_user_uidx
  ON public.sos_acknowledgements (sos_event_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sos_ack_event_chat_uidx
  ON public.sos_acknowledgements (sos_event_id, telegram_chat_id) WHERE telegram_chat_id IS NOT NULL AND user_id IS NULL;
CREATE INDEX IF NOT EXISTS sos_ack_pending_idx
  ON public.sos_acknowledgements (sos_event_id) WHERE acknowledged_at IS NULL;

GRANT SELECT, UPDATE ON public.sos_acknowledgements TO authenticated;
GRANT ALL ON public.sos_acknowledgements TO service_role;

ALTER TABLE public.sos_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read household SOS acks"
ON public.sos_acknowledgements FOR SELECT TO authenticated
USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Users can acknowledge own SOS ack"
ON public.sos_acknowledgements FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND public.is_household_member(household_id, auth.uid()))
WITH CHECK (user_id = auth.uid() AND public.is_household_member(household_id, auth.uid()));

CREATE TRIGGER set_sos_acknowledgements_updated_at
BEFORE UPDATE ON public.sos_acknowledgements
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();