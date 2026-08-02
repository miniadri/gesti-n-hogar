ALTER TABLE public.loyalty_cards
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS loyalty_cards_user_favorite_used_idx
  ON public.loyalty_cards(user_id, is_favorite DESC, last_used_at DESC NULLS LAST, merchant);

CREATE INDEX IF NOT EXISTS loyalty_cards_household_shared_used_idx
  ON public.loyalty_cards(household_id, last_used_at DESC NULLS LAST)
  WHERE is_shared = true;
