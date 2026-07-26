
CREATE TABLE public.merchant_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_suggestions TO authenticated;
GRANT ALL ON public.merchant_suggestions TO service_role;

ALTER TABLE public.merchant_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_insert_own_suggestions"
  ON public.merchant_suggestions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_read_own_suggestions"
  ON public.merchant_suggestions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins_update_suggestions"
  ON public.merchant_suggestions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins_delete_suggestions"
  ON public.merchant_suggestions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_merchant_suggestions_updated_at
  BEFORE UPDATE ON public.merchant_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_merchant_suggestions_status ON public.merchant_suggestions(status);
