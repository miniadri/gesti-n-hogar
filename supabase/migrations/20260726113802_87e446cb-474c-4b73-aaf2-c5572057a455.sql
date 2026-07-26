ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS google_sync_hours integer[] NOT NULL DEFAULT ARRAY[6,15];