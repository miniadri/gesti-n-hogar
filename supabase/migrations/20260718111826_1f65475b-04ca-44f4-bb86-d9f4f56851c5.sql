
CREATE TABLE public.medicines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  expiry_month SMALLINT CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year SMALLINT CHECK (expiry_year BETWEEN 2000 AND 2100),
  note TEXT,
  needs_purchase BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicines TO authenticated;
GRANT ALL ON public.medicines TO service_role;

ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members manage medicines"
ON public.medicines
FOR ALL
TO authenticated
USING (public.is_household_member(household_id, auth.uid()))
WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE INDEX medicines_household_idx ON public.medicines(household_id);
CREATE INDEX medicines_needs_purchase_idx ON public.medicines(household_id) WHERE needs_purchase = true;

CREATE TRIGGER medicines_set_updated_at
BEFORE UPDATE ON public.medicines
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
