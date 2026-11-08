CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text NOT NULL,
  read_at timestamptz,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own household notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Household members can insert notices" ON public.notifications;
CREATE POLICY "Users can read own household notifications" ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_household_member(household_id, auth.uid()));
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND public.is_household_member(household_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND public.is_household_member(household_id, auth.uid()));
CREATE POLICY "Household members can insert notices" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (type = 'household_notice' AND public.is_household_member(household_id, auth.uid()));
CREATE INDEX IF NOT EXISTS notifications_household_notice_idx ON public.notifications (user_id, created_at DESC) WHERE type = 'household_notice' AND read_at IS NULL;
