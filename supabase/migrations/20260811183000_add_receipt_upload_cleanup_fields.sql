ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS image_deleted_at timestamptz;

ALTER TABLE public.receipts
  ALTER COLUMN image_url DROP NOT NULL;

CREATE INDEX IF NOT EXISTS receipts_image_deleted_at_idx
  ON public.receipts (image_deleted_at)
  WHERE image_deleted_at IS NOT NULL;