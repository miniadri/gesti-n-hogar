CREATE POLICY "Members can update their own profile row"
ON public.household_members
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND public.is_household_member(household_id, auth.uid()))
WITH CHECK (user_id = auth.uid() AND public.is_household_member(household_id, auth.uid()));