CREATE TABLE IF NOT EXISTS public.household_activity_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, item_key)
);

CREATE INDEX IF NOT EXISTS household_activity_reviews_household_idx
  ON public.household_activity_reviews (household_id, reviewed_at DESC);

ALTER TABLE public.household_activity_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Household members can read activity reviews" ON public.household_activity_reviews;
CREATE POLICY "Household members can read activity reviews"
  ON public.household_activity_reviews
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

DROP POLICY IF EXISTS "Household members can review activity" ON public.household_activity_reviews;
CREATE POLICY "Household members can review activity"
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

DROP POLICY IF EXISTS "Household members can reopen activity reviews" ON public.household_activity_reviews;
CREATE POLICY "Household members can reopen activity reviews"
  ON public.household_activity_reviews
  FOR DELETE
  TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_activity_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_activity_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_household_activity_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_household_id uuid;
  deleted_count integer := 0;
BEGIN
  current_household_id := public.current_household();

  IF current_household_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM public.household_activity activity
  WHERE activity.household_id = current_household_id
    AND activity.created_at < now() - interval '90 days'
    AND (
      COALESCE(activity.status, 'info') NOT IN ('pending', 'warning', 'error', 'failed')
      OR EXISTS (
        SELECT 1
        FROM public.household_activity_reviews reviews
        WHERE reviews.household_id = activity.household_id
          AND reviews.item_key = 'activity:' || activity.id::text
      )
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_household_activity_retention() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cleanup_household_activity_retention() TO authenticated;
