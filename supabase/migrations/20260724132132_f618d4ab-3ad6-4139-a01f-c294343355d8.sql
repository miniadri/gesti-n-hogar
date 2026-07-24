CREATE TYPE public.medication_form AS ENUM ('pill', 'ml', 'drops', 'inhaler', 'patch', 'injection', 'other');
CREATE TYPE public.medication_intake_status AS ENUM ('pending', 'taken', 'skipped', 'missed');

CREATE TABLE public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  form public.medication_form NOT NULL DEFAULT 'pill',
  dose_amount NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'unidad',
  total_quantity NUMERIC(10,2),
  current_quantity NUMERIC(10,2) DEFAULT 0,
  low_stock_threshold NUMERIC(10,2),
  reminders_enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medications TO authenticated;
GRANT ALL ON public.medications TO service_role;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can manage medications"
  ON public.medications
  FOR ALL
  TO authenticated
  USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE TABLE public.medication_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  time_of_day TIME NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  frequency_type TEXT NOT NULL DEFAULT 'daily',
  interval_hours INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medication_schedules TO authenticated;
GRANT ALL ON public.medication_schedules TO service_role;
ALTER TABLE public.medication_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can manage medication schedules"
  ON public.medication_schedules
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_schedules.medication_id
        AND public.is_household_member(m.household_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_schedules.medication_id
        AND public.is_household_member(m.household_id, auth.uid())
    )
  );

CREATE TABLE public.medication_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES public.medication_schedules(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  taken_at TIMESTAMPTZ,
  status public.medication_intake_status NOT NULL DEFAULT 'pending',
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminder_sent_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medication_intakes TO authenticated;
GRANT ALL ON public.medication_intakes TO service_role;
ALTER TABLE public.medication_intakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can manage medication intakes"
  ON public.medication_intakes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_intakes.medication_id
        AND public.is_household_member(m.household_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_intakes.medication_id
        AND public.is_household_member(m.household_id, auth.uid())
    )
  );

CREATE TABLE public.telegram_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_profiles TO authenticated;
GRANT ALL ON public.telegram_profiles TO service_role;
ALTER TABLE public.telegram_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own telegram profile"
  ON public.telegram_profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_medications_household ON public.medications(household_id);
CREATE INDEX idx_medications_member ON public.medications(member_id);
CREATE INDEX idx_medication_schedules_med ON public.medication_schedules(medication_id);
CREATE INDEX idx_medication_intakes_med ON public.medication_intakes(medication_id);
CREATE INDEX idx_medication_intakes_scheduled ON public.medication_intakes(scheduled_for, status);

CREATE OR REPLACE FUNCTION public.get_medication_due_intakes(
  _household_id UUID,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
)
RETURNS TABLE (
  intake_id UUID,
  medication_id UUID,
  schedule_id UUID,
  member_id UUID,
  name TEXT,
  form public.medication_form,
  dose_amount NUMERIC,
  unit TEXT,
  scheduled_for TIMESTAMPTZ,
  status public.medication_intake_status,
  reminder_count INTEGER,
  last_reminder_sent_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    mi.id AS intake_id,
    m.id AS medication_id,
    mi.schedule_id,
    m.member_id,
    m.name,
    m.form,
    m.dose_amount,
    m.unit,
    mi.scheduled_for,
    mi.status,
    mi.reminder_count,
    mi.last_reminder_sent_at
  FROM public.medication_intakes mi
  JOIN public.medications m ON m.id = mi.medication_id
  WHERE m.household_id = _household_id
    AND mi.scheduled_for >= _from
    AND mi.scheduled_for < _to
    AND public.is_household_member(_household_id, auth.uid());
$$;

CREATE TRIGGER medications_updated_at
  BEFORE UPDATE ON public.medications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER medication_schedules_updated_at
  BEFORE UPDATE ON public.medication_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER medication_intakes_updated_at
  BEFORE UPDATE ON public.medication_intakes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER telegram_profiles_updated_at
  BEFORE UPDATE ON public.telegram_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
