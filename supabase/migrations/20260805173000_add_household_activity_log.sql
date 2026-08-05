CREATE TABLE IF NOT EXISTS public.household_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  domain text NOT NULL,
  action text NOT NULL,
  title text NOT NULL,
  details text,
  entity_type text,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_activity_domain_check
    CHECK (domain IN ('inventory', 'shopping', 'receipt')),
  CONSTRAINT household_activity_action_check
    CHECK (action IN (
      'created',
      'updated',
      'deleted',
      'restored',
      'moved',
      'checked',
      'unchecked',
      'imported',
      'scanned',
      'suggested_added'
    ))
);

CREATE INDEX IF NOT EXISTS household_activity_household_created_idx
  ON public.household_activity (household_id, created_at DESC);

CREATE INDEX IF NOT EXISTS household_activity_domain_created_idx
  ON public.household_activity (household_id, domain, created_at DESC);

ALTER TABLE public.household_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Household members can read activity" ON public.household_activity;
CREATE POLICY "Household members can read activity"
  ON public.household_activity
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

DROP POLICY IF EXISTS "Household members can insert own activity" ON public.household_activity;
CREATE POLICY "Household members can insert own activity"
  ON public.household_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND public.is_household_member(household_id, auth.uid())
  );

REVOKE UPDATE, DELETE ON public.household_activity FROM anon, authenticated;
GRANT SELECT, INSERT ON public.household_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_activity TO service_role;
