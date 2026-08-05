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
      'health',
      'finance'
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

CREATE INDEX IF NOT EXISTS household_activity_finance_created_idx
  ON public.household_activity (household_id, created_at DESC)
  WHERE domain = 'finance';
