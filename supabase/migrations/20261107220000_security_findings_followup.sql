-- Follow-up hardening for the remaining access-control findings.

-- A member must never be able to change their own child/adult classification.
CREATE OR REPLACE FUNCTION public.prevent_member_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_child IS DISTINCT FROM OLD.is_child
     AND NOT public.is_household_admin(OLD.household_id, auth.uid()) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la clasificación del miembro';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_member_role_escalation ON public.household_members;
CREATE TRIGGER prevent_member_role_escalation
  BEFORE UPDATE OF is_child ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_member_role_escalation();

-- Schedule rows are always tied to the target member's household. A member
-- may edit their own schedule; editing somebody else's schedule requires an
-- administrator in that same household.
CREATE OR REPLACE FUNCTION public.validate_schedule_household_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE target_household uuid; target_user uuid;
BEGIN
  SELECT household_id, user_id INTO target_household, target_user
  FROM public.household_members WHERE id = NEW.member_id;
  IF target_household IS NULL OR NEW.household_id IS DISTINCT FROM target_household THEN
    RAISE EXCEPTION 'El miembro no pertenece al hogar indicado';
  END IF;
  IF target_user IS DISTINCT FROM auth.uid()
     AND NOT public.is_household_admin(target_household, auth.uid()) THEN
    RAISE EXCEPTION 'No puedes modificar el cuadrante de otro miembro';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_settings','schedule_template_slots','schedule_day_slots','schedule_day_status'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS validate_schedule_household_access ON public.%I', t);
    EXECUTE format('CREATE TRIGGER validate_schedule_household_access BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validate_schedule_household_access()', t);
  END LOOP;
END $$;

-- Product catalog writes must identify the caller as the creator. Existing
-- catalog rows remain readable through the existing catalog policies.
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can insert products" ON public.products;
CREATE POLICY "Users can insert products as themselves"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
