CREATE TABLE IF NOT EXISTS public.schedule_notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  slot_key text NOT NULL,
  notice_type text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT schedule_notification_log_notice_type_check
    CHECK (notice_type IN ('start_60', 'start_30', 'ended'))
);

CREATE UNIQUE INDEX IF NOT EXISTS schedule_notification_log_once_idx
  ON public.schedule_notification_log (slot_key, notice_type);

CREATE INDEX IF NOT EXISTS schedule_notification_log_household_sent_idx
  ON public.schedule_notification_log (household_id, sent_at DESC);

ALTER TABLE public.schedule_notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Household members can read schedule notification log" ON public.schedule_notification_log;
CREATE POLICY "Household members can read schedule notification log"
  ON public.schedule_notification_log
  FOR SELECT
  TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.schedule_notification_log FROM anon, authenticated;
GRANT SELECT ON public.schedule_notification_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_notification_log TO service_role;
