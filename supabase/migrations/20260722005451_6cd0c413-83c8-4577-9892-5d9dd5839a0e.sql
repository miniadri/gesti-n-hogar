ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS notified_at timestamptz;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS notified_at timestamptz;

ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS rating smallint;
ALTER TABLE public.recipes ADD CONSTRAINT recipes_rating_range CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));

CREATE INDEX IF NOT EXISTS tasks_due_notified_idx ON public.tasks (due_date) WHERE notified_at IS NULL AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS calendar_events_start_notified_idx ON public.calendar_events (start_at) WHERE notified_at IS NULL;