ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS form public.medication_form,
  ADD COLUMN IF NOT EXISTS dose_amount NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS total_quantity NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS current_quantity NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS low_stock_threshold NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS notes TEXT;

UPDATE public.medicines
SET notes = COALESCE(notes, note)
WHERE note IS NOT NULL AND notes IS NULL;