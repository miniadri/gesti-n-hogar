-- Reusable QR labels for fast household inventory actions.
CREATE TABLE IF NOT EXISTS public.inventory_label_counters (
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  label_type TEXT NOT NULL CHECK (label_type IN ('fridge', 'freezer', 'pantry', 'medicine', 'general')),
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (household_id, label_type)
);

CREATE TABLE IF NOT EXISTS public.inventory_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  -- A QR is resolved within the authenticated household, so each household
  -- keeps its own consecutive series without leaking or colliding with others.
  code TEXT NOT NULL,
  label_type TEXT NOT NULL CHECK (label_type IN ('fridge', 'freezer', 'pantry', 'medicine', 'general')),
  inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, code)
);

CREATE INDEX IF NOT EXISTS idx_inventory_labels_household_item
  ON public.inventory_labels (household_id, inventory_item_id);

ALTER TABLE public.inventory_label_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_labels ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.inventory_label_counters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_labels TO authenticated;

CREATE POLICY "Household members can read inventory label counters"
  ON public.inventory_label_counters FOR SELECT TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Household members can read inventory labels"
  ON public.inventory_labels FOR SELECT TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Household members can manage inventory labels"
  ON public.inventory_labels FOR ALL TO authenticated
  USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE TRIGGER inventory_labels_updated_at
  BEFORE UPDATE ON public.inventory_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Reserves a consecutive range under a row lock so two browsers cannot print
-- the same label number at the same time.
CREATE OR REPLACE FUNCTION public.create_inventory_label_batch(
  p_label_type TEXT,
  p_count INTEGER
)
RETURNS SETOF public.inventory_labels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_household_id UUID;
  v_prefix TEXT;
  v_start INTEGER;
BEGIN
  IF p_count < 1 OR p_count > 100 THEN
    RAISE EXCEPTION 'El lote debe tener entre 1 y 100 etiquetas';
  END IF;

  v_household_id := public.current_household();
  IF v_household_id IS NULL OR NOT public.is_household_member(v_household_id, auth.uid()) THEN
    RAISE EXCEPTION 'No household';
  END IF;

  v_prefix := CASE p_label_type
    WHEN 'fridge' THEN 'FRI'
    WHEN 'freezer' THEN 'CON'
    WHEN 'pantry' THEN 'PAN'
    WHEN 'medicine' THEN 'MED'
    WHEN 'general' THEN 'GEN'
    ELSE NULL
  END;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'Tipo de etiqueta no válido'; END IF;

  INSERT INTO public.inventory_label_counters (household_id, label_type, last_number)
  VALUES (v_household_id, p_label_type, p_count)
  ON CONFLICT (household_id, label_type) DO UPDATE
    SET last_number = inventory_label_counters.last_number + p_count
  RETURNING last_number - p_count + 1 INTO v_start;

  RETURN QUERY
  INSERT INTO public.inventory_labels (household_id, label_type, code)
  SELECT v_household_id, p_label_type, 'HS-' || v_prefix || '-' || lpad((v_start + n - 1)::TEXT, 4, '0')
  FROM generate_series(1, p_count) AS n
  RETURNING inventory_labels.*;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_inventory_label_batch(TEXT, INTEGER) TO authenticated;
