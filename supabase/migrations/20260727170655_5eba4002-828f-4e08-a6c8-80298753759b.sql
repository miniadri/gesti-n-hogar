
-- Types
DO $$ BEGIN
  CREATE TYPE public.schedule_kind AS ENUM ('work', 'school');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_slot_kind AS ENUM ('work', 'subject', 'extracurricular', 'break', 'off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.schedule_day_state AS ENUM ('normal', 'vacation', 'holiday', 'sick', 'off');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Helper: can current user manage member's schedule (owner or household admin)
CREATE OR REPLACE FUNCTION public.can_manage_member_schedule(_member_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = _member_id
      AND (
        m.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
      AND public.is_household_member(m.household_id, auth.uid())
  );
$$;

-- Helper: can current user view member's schedule
CREATE OR REPLACE FUNCTION public.can_view_member_schedule(_member_id uuid, _is_shared boolean)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = _member_id
      AND public.is_household_member(m.household_id, auth.uid())
      AND (
        _is_shared = true
        OR m.user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
      )
  );
$$;

-- 1) schedule_settings
CREATE TABLE public.schedule_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL UNIQUE REFERENCES public.household_members(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  kind public.schedule_kind NOT NULL DEFAULT 'work',
  target_hours_per_day numeric(5,2) NOT NULL DEFAULT 8.0,
  vacation_days_per_month numeric(5,2) NOT NULL DEFAULT 2.5,
  vacation_start_date date NOT NULL DEFAULT (now()::date),
  use_template boolean NOT NULL DEFAULT true,
  is_shared boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_settings TO authenticated;
GRANT ALL ON public.schedule_settings TO service_role;
ALTER TABLE public.schedule_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_settings_select" ON public.schedule_settings
  FOR SELECT TO authenticated
  USING (public.can_view_member_schedule(member_id, is_shared));
CREATE POLICY "schedule_settings_insert" ON public.schedule_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_member_schedule(member_id));
CREATE POLICY "schedule_settings_update" ON public.schedule_settings
  FOR UPDATE TO authenticated
  USING (public.can_manage_member_schedule(member_id))
  WITH CHECK (public.can_manage_member_schedule(member_id));
CREATE POLICY "schedule_settings_delete" ON public.schedule_settings
  FOR DELETE TO authenticated
  USING (public.can_manage_member_schedule(member_id));

CREATE TRIGGER trg_schedule_settings_updated
  BEFORE UPDATE ON public.schedule_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) schedule_template_slots (weekly template)
CREATE TABLE public.schedule_template_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_kind public.schedule_slot_kind NOT NULL DEFAULT 'work',
  label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_slots_member_day ON public.schedule_template_slots(member_id, day_of_week);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_template_slots TO authenticated;
GRANT ALL ON public.schedule_template_slots TO service_role;
ALTER TABLE public.schedule_template_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_template_slots_select" ON public.schedule_template_slots
  FOR SELECT TO authenticated
  USING (public.can_view_member_schedule(
    member_id,
    COALESCE((SELECT is_shared FROM public.schedule_settings s WHERE s.member_id = schedule_template_slots.member_id), true)
  ));
CREATE POLICY "schedule_template_slots_insert" ON public.schedule_template_slots
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_member_schedule(member_id));
CREATE POLICY "schedule_template_slots_update" ON public.schedule_template_slots
  FOR UPDATE TO authenticated
  USING (public.can_manage_member_schedule(member_id))
  WITH CHECK (public.can_manage_member_schedule(member_id));
CREATE POLICY "schedule_template_slots_delete" ON public.schedule_template_slots
  FOR DELETE TO authenticated
  USING (public.can_manage_member_schedule(member_id));

CREATE TRIGGER trg_template_slots_updated
  BEFORE UPDATE ON public.schedule_template_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) schedule_day_slots (per-date override slots)
CREATE TABLE public.schedule_day_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_kind public.schedule_slot_kind NOT NULL DEFAULT 'work',
  label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_day_slots_member_date ON public.schedule_day_slots(member_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_day_slots TO authenticated;
GRANT ALL ON public.schedule_day_slots TO service_role;
ALTER TABLE public.schedule_day_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_day_slots_select" ON public.schedule_day_slots
  FOR SELECT TO authenticated
  USING (public.can_view_member_schedule(
    member_id,
    COALESCE((SELECT is_shared FROM public.schedule_settings s WHERE s.member_id = schedule_day_slots.member_id), true)
  ));
CREATE POLICY "schedule_day_slots_insert" ON public.schedule_day_slots
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_member_schedule(member_id));
CREATE POLICY "schedule_day_slots_update" ON public.schedule_day_slots
  FOR UPDATE TO authenticated
  USING (public.can_manage_member_schedule(member_id))
  WITH CHECK (public.can_manage_member_schedule(member_id));
CREATE POLICY "schedule_day_slots_delete" ON public.schedule_day_slots
  FOR DELETE TO authenticated
  USING (public.can_manage_member_schedule(member_id));

CREATE TRIGGER trg_day_slots_updated
  BEFORE UPDATE ON public.schedule_day_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) schedule_day_status (vacation / holiday / sick / off / normal + manual overtime)
CREATE TABLE public.schedule_day_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  date date NOT NULL,
  state public.schedule_day_state NOT NULL DEFAULT 'normal',
  overtime_hours numeric(5,2) NOT NULL DEFAULT 0,
  use_day_override boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id, date)
);

CREATE INDEX idx_day_status_member_date ON public.schedule_day_status(member_id, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_day_status TO authenticated;
GRANT ALL ON public.schedule_day_status TO service_role;
ALTER TABLE public.schedule_day_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_day_status_select" ON public.schedule_day_status
  FOR SELECT TO authenticated
  USING (public.can_view_member_schedule(
    member_id,
    COALESCE((SELECT is_shared FROM public.schedule_settings s WHERE s.member_id = schedule_day_status.member_id), true)
  ));
CREATE POLICY "schedule_day_status_insert" ON public.schedule_day_status
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_member_schedule(member_id));
CREATE POLICY "schedule_day_status_update" ON public.schedule_day_status
  FOR UPDATE TO authenticated
  USING (public.can_manage_member_schedule(member_id))
  WITH CHECK (public.can_manage_member_schedule(member_id));
CREATE POLICY "schedule_day_status_delete" ON public.schedule_day_status
  FOR DELETE TO authenticated
  USING (public.can_manage_member_schedule(member_id));

CREATE TRIGGER trg_day_status_updated
  BEFORE UPDATE ON public.schedule_day_status
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
