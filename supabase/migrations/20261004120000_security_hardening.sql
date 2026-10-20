-- HomeSync security hardening for the critical findings.

-- Household-scoped admin checks. The older has_role(user, role) helper is
-- intentionally not used for authorization because it has no household scope.
CREATE OR REPLACE FUNCTION public.is_household_admin(_household_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE household_id = _household_id
      AND user_id = _user_id
      AND role = 'admin'::public.app_role
  );
$$;

REVOKE ALL ON FUNCTION public.is_household_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_household_admin(uuid, uuid) TO authenticated;

-- Invite codes are only visible/manageable to household admins. Joining is
-- performed by trusted server code after an atomic claim of the invite row.
DROP POLICY IF EXISTS "Household members can view invites" ON public.household_invites;
DROP POLICY IF EXISTS "Members can read invites" ON public.household_invites;
DROP POLICY IF EXISTS "Admins can manage invites" ON public.household_invites;
DROP POLICY IF EXISTS "Admins can manage household invites" ON public.household_invites;
DROP POLICY IF EXISTS "Household admins can create invites" ON public.household_invites;
DROP POLICY IF EXISTS "Household admins can delete invites" ON public.household_invites;

CREATE POLICY "Household admins can view invites"
  ON public.household_invites FOR SELECT TO authenticated
  USING (public.is_household_admin(household_id, auth.uid()));

CREATE POLICY "Household admins can create invites"
  ON public.household_invites FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_household_admin(household_id, auth.uid())
  );

CREATE POLICY "Household admins can delete invites"
  ON public.household_invites FOR DELETE TO authenticated
  USING (public.is_household_admin(household_id, auth.uid()));

-- Prevent a member who is an admin elsewhere from changing another home's
-- household-member rows through the permissive legacy policy.
DROP POLICY IF EXISTS "Admins can manage household members" ON public.household_members;
CREATE POLICY "Household admins can manage household members"
  ON public.household_members FOR ALL TO authenticated
  USING (public.is_household_admin(household_id, auth.uid()))
  WITH CHECK (public.is_household_admin(household_id, auth.uid()));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Household admins can manage roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.is_household_admin(household_id, auth.uid()))
  WITH CHECK (public.is_household_admin(household_id, auth.uid()));

-- Once a card is no longer shared, or its photo revision is revoked, a ready
-- temporary object is no longer downloadable by the recipient.
DROP POLICY IF EXISTS "loyalty temporary transfer participant read" ON storage.objects;
CREATE POLICY "loyalty temporary transfer participant read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'loyalty-photo-transfers'
    AND EXISTS (
      SELECT 1
      FROM public.loyalty_photo_transfers t
      JOIN public.loyalty_card_photo_revisions r ON r.id = t.photo_revision_id
      JOIN public.loyalty_cards c ON c.id = t.card_id
      WHERE t.object_path = name
        AND t.expires_at > now()
        AND r.revoked_at IS NULL
        AND (
          t.sender_id = auth.uid()
          OR (t.recipient_id = auth.uid() AND t.status = 'ready' AND c.is_shared = true)
        )
    )
  );
