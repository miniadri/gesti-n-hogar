CREATE OR REPLACE FUNCTION public.get_medication_due_intakes(
  _household_id UUID,
  _from TIMESTAMPTZ,
  _to TIMESTAMPTZ
)
RETURNS TABLE (
  intake_id UUID,
  medication_id UUID,
  schedule_id UUID,
  member_id UUID,
  name TEXT,
  form public.medication_form,
  dose_amount NUMERIC,
  unit TEXT,
  scheduled_for TIMESTAMPTZ,
  status public.medication_intake_status,
  reminder_count INTEGER,
  last_reminder_sent_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    mi.id AS intake_id,
    m.id AS medication_id,
    mi.schedule_id,
    m.member_id,
    m.name,
    m.form,
    m.dose_amount,
    m.unit,
    mi.scheduled_for,
    mi.status,
    mi.reminder_count,
    mi.last_reminder_sent_at
  FROM public.medication_intakes mi
  JOIN public.medications m ON m.id = mi.medication_id
  WHERE m.household_id = _household_id
    AND mi.scheduled_for >= _from
    AND mi.scheduled_for < _to
    AND public.is_household_member(_household_id, auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.get_medication_due_intakes(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_medication_due_intakes(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
