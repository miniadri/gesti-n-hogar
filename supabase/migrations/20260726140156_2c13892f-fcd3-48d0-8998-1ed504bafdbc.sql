
ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS escalation_after_minutes integer DEFAULT 15;

ALTER TABLE public.medication_intakes
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

ALTER TABLE public.household_members
  ADD COLUMN IF NOT EXISTS is_emergency_contact boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  telegram_chat_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emergency_contacts TO authenticated;
GRANT ALL ON public.emergency_contacts TO service_role;
ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household members can view emergency contacts"
  ON public.emergency_contacts FOR SELECT TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));
CREATE POLICY "Household members can insert emergency contacts"
  ON public.emergency_contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id, auth.uid()));
CREATE POLICY "Household members can update emergency contacts"
  ON public.emergency_contacts FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));
CREATE POLICY "Household members can delete emergency contacts"
  ON public.emergency_contacts FOR DELETE TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));
CREATE TRIGGER trg_emergency_contacts_updated_at
  BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.sos_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triggered_by_name text NOT NULL,
  latitude numeric(9,6),
  longitude numeric(9,6),
  location_accuracy numeric(8,2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.sos_events TO authenticated;
GRANT ALL ON public.sos_events TO service_role;
ALTER TABLE public.sos_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household members can view SOS events"
  ON public.sos_events FOR SELECT TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));
CREATE POLICY "Household members can create SOS events"
  ON public.sos_events FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id, auth.uid()) AND triggered_by = auth.uid());
CREATE POLICY "Admins can delete SOS events"
  ON public.sos_events FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX IF NOT EXISTS idx_sos_events_household_created
  ON public.sos_events (household_id, created_at DESC);
