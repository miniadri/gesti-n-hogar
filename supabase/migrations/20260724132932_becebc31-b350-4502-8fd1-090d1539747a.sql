CREATE TABLE public.telegram_pending_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.telegram_pending_links TO authenticated;
GRANT ALL ON public.telegram_pending_links TO service_role;

ALTER TABLE public.telegram_pending_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage pending links" ON public.telegram_pending_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can delete their own pending links" ON public.telegram_pending_links FOR DELETE TO authenticated USING (true);
CREATE POLICY "Users can read pending links by token" ON public.telegram_pending_links FOR SELECT TO authenticated USING (true);