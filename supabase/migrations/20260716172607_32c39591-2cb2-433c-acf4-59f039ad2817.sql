
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS child_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_days integer,
  ADD COLUMN IF NOT EXISTS checklist jsonb,
  ADD COLUMN IF NOT EXISTS photo_path text;

-- Storage RLS for task-photos: allow household members to read/write files under <household_id>/*
CREATE POLICY "task-photos read household"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'task-photos'
  AND public.is_household_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "task-photos insert household"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'task-photos'
  AND public.is_household_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "task-photos update household"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'task-photos'
  AND public.is_household_member((storage.foldername(name))[1]::uuid, auth.uid())
);

CREATE POLICY "task-photos delete household"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'task-photos'
  AND public.is_household_member((storage.foldername(name))[1]::uuid, auth.uid())
);
