CREATE TABLE public.loyalty_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant TEXT NOT NULL,
  card_number TEXT,
  barcode TEXT,
  barcode_format TEXT,
  notes TEXT,
  color TEXT,
  front_image_url TEXT,
  back_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_cards TO authenticated;
GRANT ALL ON public.loyalty_cards TO service_role;

ALTER TABLE public.loyalty_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own loyalty cards"
  ON public.loyalty_cards FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER loyalty_cards_set_updated_at
  BEFORE UPDATE ON public.loyalty_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX loyalty_cards_user_idx ON public.loyalty_cards(user_id);