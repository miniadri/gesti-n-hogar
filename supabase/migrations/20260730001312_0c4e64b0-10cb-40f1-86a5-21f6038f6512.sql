DROP POLICY IF EXISTS "Users can insert self as member" ON public.household_members;
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert household members" ON public.household_members;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;

REVOKE INSERT ON public.household_members FROM authenticated;
REVOKE INSERT ON public.user_roles FROM authenticated;

GRANT SELECT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT SELECT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO service_role;