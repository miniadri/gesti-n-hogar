
-- Home Assistant integration
CREATE TABLE public.home_assistant_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  token_ciphertext TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown',
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.home_assistant_connections TO authenticated;
GRANT ALL ON public.home_assistant_connections TO service_role;

ALTER TABLE public.home_assistant_connections ENABLE ROW LEVEL SECURITY;

-- Members can see connection status (not token) via app-level projection;
-- only admins can insert/update/delete.
CREATE POLICY "Household members can read HA connection"
  ON public.home_assistant_connections FOR SELECT TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Household admins can insert HA connection"
  ON public.home_assistant_connections FOR INSERT TO authenticated
  WITH CHECK (
    public.is_household_member(household_id, auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Household admins can update HA connection"
  ON public.home_assistant_connections FOR UPDATE TO authenticated
  USING (
    public.is_household_member(household_id, auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Household admins can delete HA connection"
  ON public.home_assistant_connections FOR DELETE TO authenticated
  USING (
    public.is_household_member(household_id, auth.uid())
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE TRIGGER home_assistant_connections_set_updated_at
  BEFORE UPDATE ON public.home_assistant_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Extend devices to track external source (Home Assistant, future integrations)
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_id TEXT,
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_state_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS devices_household_external_uidx
  ON public.devices (household_id, external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;
