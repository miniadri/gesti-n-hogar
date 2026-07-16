
-- Helper security-definer function to check household membership without triggering RLS recursion
CREATE OR REPLACE FUNCTION public.is_household_member(_household_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = _household_id AND user_id = _user_id
  );
$$;

-- household_members: drop recursive policies and replace
DROP POLICY IF EXISTS "Members can read household members" ON public.household_members;
DROP POLICY IF EXISTS "Admins can manage household members" ON public.household_members;

CREATE POLICY "Members can read household members"
ON public.household_members FOR SELECT
TO authenticated
USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Users can insert self as member"
ON public.household_members FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage household members"
ON public.household_members FOR ALL
TO authenticated
USING (public.is_household_member(household_id, auth.uid()) AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_household_member(household_id, auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- households: use helper
DROP POLICY IF EXISTS "Household members can read households" ON public.households;
CREATE POLICY "Household members can read households"
ON public.households FOR SELECT
TO authenticated
USING (public.is_household_member(id, auth.uid()));

-- user_roles: use helper
DROP POLICY IF EXISTS "Users can read own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Users can read own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Users can insert own role"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.is_household_member(household_id, auth.uid()) AND public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_household_member(household_id, auth.uid()) AND public.has_role(auth.uid(), 'admin'));
