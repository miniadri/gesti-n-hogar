-- Close direct household membership and role escalation paths.
-- Joining a household is handled by trusted server code after validating an
-- unexpired invite. Clients must not be able to insert arbitrary membership or
-- role rows directly.

DROP POLICY IF EXISTS "Users can insert self as member" ON public.household_members;
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;

CREATE POLICY "Admins can insert household members"
ON public.household_members FOR INSERT
TO authenticated
WITH CHECK (
  public.is_household_member(household_id, auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (
  public.is_household_member(household_id, auth.uid())
  AND public.has_role(auth.uid(), 'admin')
  AND role IN ('admin'::public.app_role, 'member'::public.app_role, 'child'::public.app_role)
);

-- Keep the existing admin-management policies for updates/deletes, but make
-- sure service_role can still perform invite-based joins and auth triggers can
-- create initial/default records.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO service_role;
