ALTER TABLE public.household_invites
  ADD COLUMN IF NOT EXISTS used_at timestamptz,
  ADD COLUMN IF NOT EXISTS used_by uuid REFERENCES auth.users(id);

CREATE POLICY "Household members can view invites"
ON public.household_invites
FOR SELECT
TO authenticated
USING (public.is_household_member(household_id, auth.uid()));