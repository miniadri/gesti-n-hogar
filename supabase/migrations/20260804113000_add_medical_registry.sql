CREATE TABLE IF NOT EXISTS public.medical_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  blood_type text,
  height_cm numeric(5,2),
  weight_kg numeric(6,2),
  public_health_provider text,
  public_health_id text,
  private_insurance_name text,
  private_policy_number text,
  private_coverage_notes text,
  emergency_notes text,
  show_in_sos boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medical_profiles_member_unique UNIQUE (member_id)
);

CREATE TABLE IF NOT EXISTS public.medical_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  title text NOT NULL,
  severity text,
  occurred_on date,
  follow_up_on date,
  notes text,
  show_in_sos boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medical_records_type_check
    CHECK (record_type IN ('condition', 'allergy', 'visit', 'note', 'procedure', 'vaccine', 'other')),
  CONSTRAINT medical_records_severity_check
    CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical'))
);

CREATE INDEX IF NOT EXISTS medical_profiles_household_idx
  ON public.medical_profiles (household_id);

CREATE INDEX IF NOT EXISTS medical_records_household_member_idx
  ON public.medical_records (household_id, member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS medical_records_sos_idx
  ON public.medical_records (household_id, member_id)
  WHERE show_in_sos = true OR severity IN ('high', 'critical');

ALTER TABLE public.medical_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Adult household members can manage medical profiles" ON public.medical_profiles;
CREATE POLICY "Adult household members can manage medical profiles"
  ON public.medical_profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.household_id = medical_profiles.household_id
        AND hm.user_id = auth.uid()
        AND COALESCE(hm.is_child, false) = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.household_id = medical_profiles.household_id
        AND hm.user_id = auth.uid()
        AND COALESCE(hm.is_child, false) = false
    )
    AND EXISTS (
      SELECT 1
      FROM public.household_members target
      WHERE target.id = medical_profiles.member_id
        AND target.household_id = medical_profiles.household_id
    )
  );

DROP POLICY IF EXISTS "Adult household members can manage medical records" ON public.medical_records;
CREATE POLICY "Adult household members can manage medical records"
  ON public.medical_records
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.household_id = medical_records.household_id
        AND hm.user_id = auth.uid()
        AND COALESCE(hm.is_child, false) = false
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.household_members hm
      WHERE hm.household_id = medical_records.household_id
        AND hm.user_id = auth.uid()
        AND COALESCE(hm.is_child, false) = false
    )
    AND EXISTS (
      SELECT 1
      FROM public.household_members target
      WHERE target.id = medical_records.member_id
        AND target.household_id = medical_records.household_id
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medical_records TO authenticated;
GRANT ALL ON public.medical_profiles TO service_role;
GRANT ALL ON public.medical_records TO service_role;

ALTER TABLE public.sos_events
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS ended_by uuid,
  ADD COLUMN IF NOT EXISTS end_reason text;

