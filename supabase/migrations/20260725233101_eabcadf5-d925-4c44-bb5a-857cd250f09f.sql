
-- 1) Storage table for per-user connector keys (encrypted)
CREATE TABLE IF NOT EXISTS public.app_user_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connector_id text NOT NULL,
  connection_key_ciphertext text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, connector_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_user_connections TO service_role;
ALTER TABLE public.app_user_connections ENABLE ROW LEVEL SECURITY;
-- No policies for anon/authenticated on purpose — only server (service_role) reads it.

-- 2) Extend calendar_events for Google sync + visibility
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS google_calendar_id text,
  ADD COLUMN IF NOT EXISTS google_event_etag text;

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_google_unique
  ON public.calendar_events (created_by, external_id)
  WHERE source = 'google_calendar' AND external_id IS NOT NULL;

-- 3) Rewrite RLS: private by default, public visible to household
DROP POLICY IF EXISTS "Household members can manage events" ON public.calendar_events;

CREATE POLICY "View own or public events"
  ON public.calendar_events
  FOR SELECT
  TO authenticated
  USING (
    public.is_household_member(household_id, auth.uid())
    AND (is_public = true OR created_by = auth.uid())
  );

CREATE POLICY "Insert own events in household"
  ON public.calendar_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_household_member(household_id, auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY "Update own events"
  ON public.calendar_events
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Delete own events"
  ON public.calendar_events
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());
