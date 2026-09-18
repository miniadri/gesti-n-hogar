-- Change histories are private to household administrators unless explicitly shared.
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS history_visible_to_all boolean NOT NULL DEFAULT false;
