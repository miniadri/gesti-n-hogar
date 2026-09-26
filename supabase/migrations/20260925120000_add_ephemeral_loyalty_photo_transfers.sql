-- HomeSync v0.87: photo revision metadata and one-recipient encrypted transfers.
-- The encrypted binary is temporary. Card photos are never stored permanently
-- in Supabase: only a checksum, size and version are retained.

CREATE TABLE IF NOT EXISTS public.loyalty_card_photo_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('front', 'back')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  checksum text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 2000000),
  content_type text NOT NULL CHECK (content_type IN ('image/webp', 'image/jpeg')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (card_id, side)
);

CREATE INDEX IF NOT EXISTS loyalty_photo_revisions_household_idx
  ON public.loyalty_card_photo_revisions(household_id, card_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.loyalty_photo_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_revision_id uuid NOT NULL REFERENCES public.loyalty_card_photo_revisions(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.loyalty_cards(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_public_key text NOT NULL,
  encrypted_key text,
  encryption_iv text,
  object_path text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'ready', 'received', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS loyalty_photo_transfers_sender_idx
  ON public.loyalty_photo_transfers(sender_id, status, expires_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_photo_transfers_recipient_idx
  ON public.loyalty_photo_transfers(recipient_id, status, expires_at DESC);

ALTER TABLE public.loyalty_card_photo_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_photo_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loyalty photo revisions view household" ON public.loyalty_card_photo_revisions;
CREATE POLICY "loyalty photo revisions view household"
  ON public.loyalty_card_photo_revisions FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_household_member(household_id, auth.uid()));

DROP POLICY IF EXISTS "loyalty photo revisions owner manage" ON public.loyalty_card_photo_revisions;
CREATE POLICY "loyalty photo revisions owner manage"
  ON public.loyalty_card_photo_revisions FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "loyalty transfers participant view" ON public.loyalty_photo_transfers;
CREATE POLICY "loyalty transfers participant view"
  ON public.loyalty_photo_transfers FOR SELECT TO authenticated
  USING (sender_id = auth.uid() OR recipient_id = auth.uid());

DROP POLICY IF EXISTS "loyalty transfers recipient request" ON public.loyalty_photo_transfers;
CREATE POLICY "loyalty transfers recipient request"
  ON public.loyalty_photo_transfers FOR INSERT TO authenticated
  WITH CHECK (
    recipient_id = auth.uid()
    AND status = 'requested'
    AND sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.loyalty_card_photo_revisions r
      JOIN public.loyalty_cards c ON c.id = r.card_id
      WHERE r.id = photo_revision_id
        AND r.card_id = card_id
        AND r.owner_id = sender_id
        AND r.revoked_at IS NULL
        AND c.is_shared = true
        AND c.household_id = r.household_id
        AND public.is_household_member(c.household_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "loyalty transfers sender update" ON public.loyalty_photo_transfers;
CREATE POLICY "loyalty transfers sender update"
  ON public.loyalty_photo_transfers FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() AND status = 'requested' AND expires_at > now())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "loyalty transfers recipient complete" ON public.loyalty_photo_transfers;
CREATE POLICY "loyalty transfers recipient complete"
  ON public.loyalty_photo_transfers FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() AND status = 'ready')
  WITH CHECK (recipient_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('loyalty-photo-transfers', 'loyalty-photo-transfers', false, 2000000, ARRAY['application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 2000000, allowed_mime_types = ARRAY['application/octet-stream'];

DROP POLICY IF EXISTS "loyalty temporary transfer sender upload" ON storage.objects;
CREATE POLICY "loyalty temporary transfer sender upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'loyalty-photo-transfers'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1 FROM public.loyalty_photo_transfers t
      WHERE t.sender_id = auth.uid()
        AND t.status = 'requested'
        AND t.expires_at > now()
        AND name = auth.uid()::text || '/' || t.id::text || '.bin'
    )
  );

DROP POLICY IF EXISTS "loyalty temporary transfer participant read" ON storage.objects;
CREATE POLICY "loyalty temporary transfer participant read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'loyalty-photo-transfers'
    AND EXISTS (
      SELECT 1 FROM public.loyalty_photo_transfers t
      WHERE t.object_path = name
        AND t.expires_at > now()
        AND (t.sender_id = auth.uid() OR (t.recipient_id = auth.uid() AND t.status = 'ready'))
    )
  );

DROP POLICY IF EXISTS "loyalty temporary transfer recipient delete" ON storage.objects;
CREATE POLICY "loyalty temporary transfer recipient delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'loyalty-photo-transfers'
    AND EXISTS (
      SELECT 1 FROM public.loyalty_photo_transfers t
      WHERE t.object_path = name
        AND t.recipient_id = auth.uid()
        AND t.status = 'ready'
    )
  );

CREATE OR REPLACE FUNCTION public.cleanup_expired_loyalty_photo_transfers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'loyalty-photo-transfers'
    AND name IN (
      SELECT object_path FROM public.loyalty_photo_transfers
      WHERE object_path IS NOT NULL AND expires_at <= now() AND status <> 'received'
    );

  UPDATE public.loyalty_photo_transfers
  SET status = 'expired'
  WHERE expires_at <= now() AND status IN ('requested', 'ready');
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_loyalty_photo_transfers() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cleanup-loyalty-photo-transfers';
  PERFORM cron.schedule(
    'cleanup-loyalty-photo-transfers',
    '*/30 * * * *',
    'SELECT public.cleanup_expired_loyalty_photo_transfers()'
  );
EXCEPTION WHEN undefined_table THEN
  -- The application still expires transfers on the next interaction if pg_cron
  -- is unavailable; production Supabase installs it for the scheduled cleanup.
  NULL;
END;
$$;
