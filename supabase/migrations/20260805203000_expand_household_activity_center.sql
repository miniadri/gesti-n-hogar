ALTER TABLE public.household_activity
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.household_activity
  DROP CONSTRAINT IF EXISTS household_activity_domain_check;

ALTER TABLE public.household_activity
  ADD CONSTRAINT household_activity_domain_check
  CHECK (
    domain IN (
      'inventory',
      'shopping',
      'receipt',
      'notification',
      'sos',
      'schedule',
      'calendar',
      'medication',
      'health'
    )
  );

ALTER TABLE public.household_activity
  DROP CONSTRAINT IF EXISTS household_activity_action_check;

ALTER TABLE public.household_activity
  ADD CONSTRAINT household_activity_action_check
  CHECK (
    action IN (
      'created',
      'updated',
      'deleted',
      'restored',
      'moved',
      'checked',
      'unchecked',
      'imported',
      'scanned',
      'suggested_added',
      'sent',
      'failed',
      'triggered',
      'acknowledged',
      'cancelled',
      'ended',
      'reminded',
      'test',
      'notified',
      'taken',
      'missed',
      'skipped',
      'low_stock',
      'expiring'
    )
  );

ALTER TABLE public.household_activity
  DROP CONSTRAINT IF EXISTS household_activity_status_check;

ALTER TABLE public.household_activity
  ADD CONSTRAINT household_activity_status_check
  CHECK (
    status IS NULL OR status IN ('ok', 'sent', 'success', 'pending', 'warning', 'error', 'failed', 'info')
  );

CREATE INDEX IF NOT EXISTS household_activity_status_created_idx
  ON public.household_activity (household_id, status, created_at DESC);
