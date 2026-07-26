
ALTER TABLE public.loyalty_cards
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES public.households(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS loyalty_cards_household_shared_idx
  ON public.loyalty_cards(household_id) WHERE is_shared = true;

DROP POLICY IF EXISTS "Household members view shared loyalty cards" ON public.loyalty_cards;
CREATE POLICY "Household members view shared loyalty cards"
  ON public.loyalty_cards
  FOR SELECT
  TO authenticated
  USING (
    is_shared = true
    AND household_id IS NOT NULL
    AND public.is_household_member(household_id, auth.uid())
  );
