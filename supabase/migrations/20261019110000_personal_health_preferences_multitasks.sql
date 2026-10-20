BEGIN;

CREATE OR REPLACE FUNCTION public.is_personal_household_member(_household uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_members
    WHERE household_id = _household AND user_id = auth.uid() AND display_name <> 'Kiosko cocina');
$$;
REVOKE ALL ON FUNCTION public.is_personal_household_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_personal_household_member(uuid) TO authenticated;

CREATE TABLE public.member_preferences (
  household_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  block text NOT NULL CHECK (block IN ('sizes', 'food', 'style', 'hobbies')),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'selected', 'household')),
  recipients uuid[] NOT NULL DEFAULT '{}',
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (household_id, owner_user_id, block),
  FOREIGN KEY (household_id, owner_user_id) REFERENCES public.household_members(household_id, user_id) ON DELETE CASCADE,
  CHECK (cardinality(recipients) <= 100 AND array_position(recipients, NULL) IS NULL),
  CHECK (visibility <> 'selected' OR cardinality(recipients) > 0)
);
ALTER TABLE public.member_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY preferences_read ON public.member_preferences FOR SELECT TO authenticated
  USING (public.is_personal_household_member(household_id) AND
    (owner_user_id = auth.uid() OR visibility = 'household' OR (visibility = 'selected' AND auth.uid() = ANY(recipients))));
REVOKE ALL ON public.member_preferences FROM anon, authenticated;
GRANT SELECT ON public.member_preferences TO authenticated;

CREATE TABLE public.cycle_shared_summaries (
  household_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date,
  next_date date,
  recipients uuid[] NOT NULL,
  PRIMARY KEY (household_id, owner_user_id),
  FOREIGN KEY (household_id, owner_user_id) REFERENCES public.household_members(household_id, user_id) ON DELETE CASCADE,
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (next_date IS NULL OR next_date > start_date),
  CHECK (cardinality(recipients) BETWEEN 1 AND 100 AND array_position(recipients, NULL) IS NULL)
);
ALTER TABLE public.cycle_shared_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY cycle_summary_read ON public.cycle_shared_summaries FOR SELECT TO authenticated
  USING (public.is_personal_household_member(household_id) AND (owner_user_id = auth.uid() OR auth.uid() = ANY(recipients)));
CREATE POLICY cycle_summary_write ON public.cycle_shared_summaries FOR ALL TO authenticated
  USING (public.is_personal_household_member(household_id) AND owner_user_id = auth.uid())
  WITH CHECK (public.is_personal_household_member(household_id) AND owner_user_id = auth.uid());
REVOKE ALL ON public.cycle_shared_summaries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cycle_shared_summaries TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_personal_recipients()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.recipients) AS recipient(user_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.household_members AS member
      WHERE member.household_id = NEW.household_id AND member.user_id = recipient.user_id
      AND member.user_id <> NEW.owner_user_id AND member.display_name <> 'Kiosko cocina')) THEN
    RAISE EXCEPTION 'Destinatario ajeno al hogar o no válido';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cycle_recipients BEFORE INSERT OR UPDATE ON public.cycle_shared_summaries
  FOR EACH ROW EXECUTE FUNCTION public.validate_personal_recipients();

CREATE OR REPLACE FUNCTION public.save_member_preference(_household uuid, _block text, _details text, _visibility text, _recipients uuid[], _revision integer)
RETURNS public.member_preferences LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE saved public.member_preferences;
BEGIN
  IF NOT public.is_personal_household_member(_household) THEN RAISE EXCEPTION 'Hogar no autorizado'; END IF;
  IF _visibility <> 'selected' THEN _recipients := '{}'; END IF;
  IF _revision = 0 THEN
    INSERT INTO public.member_preferences(household_id, owner_user_id, block, details, visibility, recipients)
    VALUES (_household, auth.uid(), _block, _details, _visibility, _recipients)
    ON CONFLICT DO NOTHING RETURNING * INTO saved;
  ELSE
    UPDATE public.member_preferences SET details = _details, visibility = _visibility, recipients = _recipients, revision = revision + 1
    WHERE household_id = _household AND owner_user_id = auth.uid() AND block = _block AND revision = _revision
    RETURNING * INTO saved;
  END IF;
  IF saved.owner_user_id IS NULL THEN RAISE EXCEPTION 'Conflicto: recarga las preferencias antes de guardar'; END IF;
  RETURN saved;
END;
$$;
CREATE TRIGGER preference_recipients BEFORE INSERT OR UPDATE ON public.member_preferences
  FOR EACH ROW EXECUTE FUNCTION public.validate_personal_recipients();
REVOKE ALL ON FUNCTION public.save_member_preference(uuid,text,text,text,uuid[],integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_member_preference(uuid,text,text,text,uuid[],integer) TO authenticated;

CREATE TABLE public.personal_cycle_reminders (
  household_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  due_at timestamptz NOT NULL,
  expected_date date NOT NULL,
  notified_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  last_attempt_at timestamptz,
  PRIMARY KEY (household_id, owner_user_id),
  FOREIGN KEY (household_id, owner_user_id) REFERENCES public.household_members(household_id, user_id) ON DELETE CASCADE
);
ALTER TABLE public.personal_cycle_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY personal_reminder_owner ON public.personal_cycle_reminders FOR ALL TO authenticated
  USING (public.is_personal_household_member(household_id) AND owner_user_id = auth.uid())
  WITH CHECK (public.is_personal_household_member(household_id) AND owner_user_id = auth.uid());
REVOKE ALL ON public.personal_cycle_reminders FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_cycle_reminders TO authenticated;
GRANT ALL ON public.personal_cycle_reminders TO service_role;

CREATE OR REPLACE FUNCTION public.save_personal_cycle_reminder(_household uuid, _due timestamptz, _next date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_personal_household_member(_household) THEN RAISE EXCEPTION 'Hogar no autorizado'; END IF;
  IF _due IS NULL OR _next IS NULL OR _due < now() - interval '1 minute' OR _due > now() + interval '370 days' THEN RAISE EXCEPTION 'Fecha de aviso no válida'; END IF;
  INSERT INTO public.personal_cycle_reminders(household_id, owner_user_id, due_at, expected_date)
    VALUES (_household, auth.uid(), _due, _next)
    ON CONFLICT (household_id, owner_user_id) DO UPDATE SET due_at = EXCLUDED.due_at, expected_date = EXCLUDED.expected_date, notified_at = NULL, attempts = 0, last_attempt_at = NULL
    WHERE personal_cycle_reminders.due_at IS DISTINCT FROM EXCLUDED.due_at OR personal_cycle_reminders.expected_date IS DISTINCT FROM EXCLUDED.expected_date;
END;
$$;
REVOKE ALL ON FUNCTION public.save_personal_cycle_reminder(uuid,timestamptz,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_personal_cycle_reminder(uuid,timestamptz,date) TO authenticated;

ALTER TABLE public.tasks
  ADD COLUMN assigned_member_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN completed_member_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN completion_mode text NOT NULL DEFAULT 'any' CHECK (completion_mode IN ('any', 'all')),
  ADD COLUMN recurrence_parent_id uuid UNIQUE REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD CONSTRAINT tasks_assignees_bounded CHECK (cardinality(assigned_member_ids) <= 100 AND array_position(assigned_member_ids, NULL) IS NULL),
  ADD CONSTRAINT tasks_completions_bounded CHECK (cardinality(completed_member_ids) <= 100 AND array_position(completed_member_ids, NULL) IS NULL);
UPDATE public.tasks SET assigned_member_ids = ARRAY[assigned_to] WHERE assigned_to IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_task_members()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF cardinality(NEW.assigned_member_ids) = 0 AND NEW.assigned_to IS NOT NULL THEN NEW.assigned_member_ids := ARRAY[NEW.assigned_to]; END IF;
    IF cardinality(NEW.completed_member_ids) > 0 AND current_user NOT IN ('postgres', 'service_role') THEN RAISE EXCEPTION 'Usa la acción de completar tarea'; END IF;
  ELSE
    IF NEW.completed_member_ids IS DISTINCT FROM OLD.completed_member_ids AND current_user NOT IN ('postgres', 'service_role') THEN RAISE EXCEPTION 'Usa la acción de completar tarea'; END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_member_ids IS NOT DISTINCT FROM OLD.assigned_member_ids THEN
      NEW.assigned_member_ids := CASE WHEN NEW.assigned_to IS NULL THEN '{}'::uuid[] ELSE ARRAY[NEW.assigned_to] END;
    END IF;
  END IF;
  NEW.assigned_member_ids := ARRAY(SELECT DISTINCT member_id FROM unnest(NEW.assigned_member_ids) AS selected(member_id));
  NEW.assigned_to := CASE WHEN cardinality(NEW.assigned_member_ids) = 1 THEN NEW.assigned_member_ids[1] ELSE NULL END;
  IF NEW.completion_mode = 'all' AND cardinality(NEW.assigned_member_ids) = 0 THEN RAISE EXCEPTION 'Selecciona responsables para completar entre todos'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(NEW.assigned_member_ids) AS selected(member_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.household_members AS member WHERE member.id = selected.member_id
      AND member.household_id = NEW.household_id AND member.display_name <> 'Kiosko cocina' AND (NEW.child_allowed OR NOT member.is_child))) THEN
    RAISE EXCEPTION 'Responsable no autorizado para esta tarea';
  END IF;
  IF NEW.completion_mode = 'all' AND NEW.status = 'done' AND NOT (NEW.assigned_member_ids <@ NEW.completed_member_ids) THEN RAISE EXCEPTION 'Faltan responsables por completar'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tasks_validate_members BEFORE INSERT OR UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.validate_task_members();

CREATE OR REPLACE FUNCTION public.spawn_next_household_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'done' AND OLD.status <> 'done' AND NEW.recurrence_days IS NOT NULL THEN
    INSERT INTO public.tasks(household_id, created_by, title, description, assigned_to, assigned_member_ids, priority, category,
      due_date, recurrence_days, child_allowed, checklist, photo_path, status, completion_mode, recurrence_parent_id)
    VALUES (NEW.household_id, NEW.created_by, NEW.title, NEW.description, NEW.assigned_to, NEW.assigned_member_ids, NEW.priority, NEW.category,
      coalesce(NEW.due_date, now()) + make_interval(days => NEW.recurrence_days), NEW.recurrence_days, NEW.child_allowed,
      CASE WHEN NEW.checklist IS NULL THEN NULL ELSE (SELECT jsonb_agg(jsonb_set(element, '{done}', 'false')) FROM jsonb_array_elements(NEW.checklist) AS element) END,
      NEW.photo_path, 'pending', NEW.completion_mode, NEW.id)
    ON CONFLICT (recurrence_parent_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tasks_spawn_next AFTER UPDATE OF status ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.spawn_next_household_task();

CREATE OR REPLACE FUNCTION public.complete_household_task(_task_id uuid, _member_id uuid DEFAULT NULL)
RETURNS public.tasks LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.tasks; actor public.household_members; subject public.household_members;
BEGIN
  SELECT * INTO target FROM public.tasks WHERE id = _task_id FOR UPDATE;
  IF target.id IS NULL THEN RAISE EXCEPTION 'Tarea no disponible'; END IF;
  SELECT * INTO actor FROM public.household_members WHERE household_id = target.household_id AND user_id = auth.uid();
  IF actor.id IS NULL OR actor.display_name = 'Kiosko cocina' THEN RAISE EXCEPTION 'No autorizado'; END IF;
  SELECT * INTO subject FROM public.household_members WHERE id = coalesce(_member_id, actor.id) AND household_id = target.household_id;
  IF subject.id IS NULL OR subject.display_name = 'Kiosko cocina' THEN RAISE EXCEPTION 'Responsable no válido'; END IF;
  IF subject.id <> actor.id AND NOT (subject.is_child AND NOT actor.is_child AND EXISTS
    (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND household_id = target.household_id AND role = 'admin')) THEN RAISE EXCEPTION 'Solo puede completar su parte'; END IF;
  IF (actor.is_child OR subject.is_child) AND NOT target.child_allowed THEN RAISE EXCEPTION 'Tarea no apta para menores'; END IF;
  IF cardinality(target.assigned_member_ids) > 0 AND NOT (subject.id = ANY(target.assigned_member_ids)) THEN RAISE EXCEPTION 'No es responsable de esta tarea'; END IF;
  IF target.status IN ('done', 'cancelled') OR subject.id = ANY(target.completed_member_ids) THEN RETURN target; END IF;
  UPDATE public.tasks SET completed_member_ids = array_append(completed_member_ids, subject.id),
    status = CASE WHEN completion_mode = 'any' OR assigned_member_ids <@ array_append(completed_member_ids, subject.id) THEN 'done' ELSE 'in_progress' END
    WHERE id = target.id RETURNING * INTO target;
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_household_task(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_household_task(uuid,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_personal_recipients() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_task_members() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spawn_next_household_task() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.revoke_departed_personal_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.cycle_shared_summaries WHERE household_id = OLD.household_id
    AND OLD.user_id = ANY(recipients) AND cardinality(array_remove(recipients, OLD.user_id)) = 0;
  UPDATE public.cycle_shared_summaries SET recipients = array_remove(recipients, OLD.user_id)
    WHERE household_id = OLD.household_id AND OLD.user_id = ANY(recipients);
  UPDATE public.member_preferences SET recipients = array_remove(recipients, OLD.user_id), revision = revision + 1,
    visibility = CASE WHEN visibility = 'selected' AND cardinality(array_remove(recipients, OLD.user_id)) = 0 THEN 'private' ELSE visibility END
    WHERE household_id = OLD.household_id AND OLD.user_id = ANY(recipients);
  UPDATE public.tasks SET assigned_member_ids = array_remove(assigned_member_ids, OLD.id), completed_member_ids = array_remove(completed_member_ids, OLD.id),
    completion_mode = CASE WHEN cardinality(array_remove(assigned_member_ids, OLD.id)) = 0 THEN 'any' ELSE completion_mode END
    WHERE household_id = OLD.household_id AND OLD.id = ANY(assigned_member_ids);
  RETURN OLD;
END;
$$;
CREATE TRIGGER revoke_personal_access_before_departure BEFORE DELETE ON public.household_members
  FOR EACH ROW EXECUTE FUNCTION public.revoke_departed_personal_access();
REVOKE ALL ON FUNCTION public.revoke_departed_personal_access() FROM PUBLIC;

COMMIT;
