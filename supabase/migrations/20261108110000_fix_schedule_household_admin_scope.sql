-- Corrige el ámbito de administración en las funciones de cuadrante para no consultar roles globales
CREATE OR REPLACE FUNCTION public.can_manage_member_schedule(p_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_target_user_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_member_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT household_id, user_id
    INTO v_household_id, v_target_user_id
    FROM public.household_members
   WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_target_user_id = v_user_id THEN
    RETURN true;
  END IF;

  -- Comprobación acotada estrictamente al hogar del miembro objetivo
  IF public.is_household_admin(v_household_id, v_user_id) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_member_schedule(p_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_household_id uuid;
BEGIN
  IF v_user_id IS NULL OR p_member_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT household_id
    INTO v_household_id
    FROM public.household_members
   WHERE id = p_member_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.household_members m
     WHERE m.household_id = v_household_id
       AND m.user_id = v_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_member_schedule(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_member_schedule(uuid) TO authenticated;
