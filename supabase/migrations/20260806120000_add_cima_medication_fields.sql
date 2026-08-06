ALTER TABLE public.medications
  ADD COLUMN IF NOT EXISTS doctor_instructions text,
  ADD COLUMN IF NOT EXISTS cima_nregistro text,
  ADD COLUMN IF NOT EXISTS cima_cn text,
  ADD COLUMN IF NOT EXISTS cima_name text,
  ADD COLUMN IF NOT EXISTS cima_active_ingredients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cima_excipients text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cima_prospect_url text,
  ADD COLUMN IF NOT EXISTS cima_ficha_tecnica_url text,
  ADD COLUMN IF NOT EXISTS cima_url text,
  ADD COLUMN IF NOT EXISTS cima_prescription_required boolean;

CREATE INDEX IF NOT EXISTS medications_cima_nregistro_idx
  ON public.medications (cima_nregistro)
  WHERE cima_nregistro IS NOT NULL;
