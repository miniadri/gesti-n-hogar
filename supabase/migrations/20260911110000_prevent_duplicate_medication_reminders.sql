-- Ensure a medication schedule can only create one intake at a given instant,
-- then provide an atomic reservation used by both the cron and manual sender.

-- Older concurrent generators may already have created duplicate rows. Keep one
-- row for each scheduled intake, preferring a completed record over a pending
-- one so historical confirmations are never discarded in favour of a reminder.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY medication_id, schedule_id, scheduled_for
      ORDER BY
        CASE status
          WHEN 'taken' THEN 0
          WHEN 'skipped' THEN 1
          WHEN 'missed' THEN 2
          ELSE 3
        END,
        created_at,
        id
    ) AS duplicate_rank
  FROM public.medication_intakes
)
DELETE FROM public.medication_intakes AS intake
USING ranked
WHERE intake.id = ranked.id
  AND ranked.duplicate_rank > 1;

ALTER TABLE public.medication_intakes
  ADD CONSTRAINT medication_intakes_one_per_schedule_time
  UNIQUE (medication_id, schedule_id, scheduled_for);

-- Returns a row only to the one caller that successfully reserves this
-- reminder.  UPDATE obtains the row lock before evaluating the predicate, so
-- concurrent callers cannot both notify the same intake.
CREATE OR REPLACE FUNCTION public.claim_medication_intake_reminder(
  _intake_id uuid,
  _minimum_interval_minutes integer DEFAULT 5
)
RETURNS TABLE (id uuid, reminder_count integer, last_reminder_sent_at timestamptz)
LANGUAGE sql
AS $$
  UPDATE public.medication_intakes
  SET
    reminder_count = medication_intakes.reminder_count + 1,
    last_reminder_sent_at = now()
  WHERE medication_intakes.id = _intake_id
    AND medication_intakes.status = 'pending'
    AND (
      medication_intakes.last_reminder_sent_at IS NULL
      OR medication_intakes.last_reminder_sent_at <= now() - make_interval(mins => _minimum_interval_minutes)
    )
  RETURNING
    medication_intakes.id,
    medication_intakes.reminder_count,
    medication_intakes.last_reminder_sent_at;
$$;

GRANT EXECUTE ON FUNCTION public.claim_medication_intake_reminder(uuid, integer)
  TO authenticated, service_role;
