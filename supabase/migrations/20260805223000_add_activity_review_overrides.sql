CREATE TABLE IF NOT EXISTS public.household_activity_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT household_activity_reviews_item_key_check
    CHECK (position(':' in item_key) > 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS household_activity_reviews_once_idx
  ON public.household_activity_reviews (household_id, item_key);

CREATE INDEX IF NOT EXISTS household_activity_reviews_household_created_idx
  ON public.household_activity_reviews (household_id, created_at DESC);

ALTER TABLE public.household_activity_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Household members can read activity reviews" ON public.household_activity_reviews;
CREATE POLICY "Household members can read activity reviews"
  ON public.household_activity_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

DROP POLICY IF EXISTS "Household members can insert own activity reviews" ON public.household_activity_reviews;
CREATE POLICY "Household members can insert own activity reviews"
  ON public.household_activity_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    reviewed_by = auth.uid()
    AND public.is_household_member(household_id, auth.uid())
  );

DROP POLICY IF EXISTS "Household members can update own activity reviews" ON public.household_activity_reviews;
CREATE POLICY "Household members can update own activity reviews"
  ON public.household_activity_reviews
  FOR UPDATE
  TO authenticated
  USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (
    reviewed_by = auth.uid()
    AND public.is_household_member(household_id, auth.uid())
  );

DROP POLICY IF EXISTS "Household members can delete activity reviews" ON public.household_activity_reviews;
CREATE POLICY "Household members can delete activity reviews"
  ON public.household_activity_reviews
  FOR DELETE
  TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

REVOKE ALL ON public.household_activity_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_activity_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_activity_reviews TO service_role;
