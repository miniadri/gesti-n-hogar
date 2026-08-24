-- Lista de Deseos (wishlist) with secret gift claims

CREATE TABLE public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by_member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  for_member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  url text,
  estimated_price numeric(10,2),
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'active',
  recipient_reaction text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlist_items_priority_check CHECK (priority IN ('low','medium','high')),
  CONSTRAINT wishlist_items_status_check CHECK (status IN ('active','fulfilled','archived')),
  CONSTRAINT wishlist_items_reaction_check CHECK (recipient_reaction IN ('pending','liked','dismissed'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;
GRANT ALL ON public.wishlist_items TO service_role;

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members can view wishlist items"
ON public.wishlist_items FOR SELECT TO authenticated
USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Household members can create wishlist items"
ON public.wishlist_items FOR INSERT TO authenticated
WITH CHECK (
  public.is_household_member(household_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = created_by_member_id
      AND m.household_id = wishlist_items.household_id
      AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Author recipient or admin can update wishlist items"
ON public.wishlist_items FOR UPDATE TO authenticated
USING (
  public.is_household_member(household_id, auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.household_members m
      WHERE m.id IN (created_by_member_id, for_member_id)
        AND m.user_id = auth.uid()
    )
  )
)
WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Author recipient or admin can delete wishlist items"
ON public.wishlist_items FOR DELETE TO authenticated
USING (
  public.is_household_member(household_id, auth.uid())
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.household_members m
      WHERE m.id IN (created_by_member_id, for_member_id)
        AND m.user_id = auth.uid()
    )
  )
);

CREATE TRIGGER trg_wishlist_items_updated_at
BEFORE UPDATE ON public.wishlist_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Secret claims
CREATE TABLE public.wishlist_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wishlist_item_id uuid NOT NULL REFERENCES public.wishlist_items(id) ON DELETE CASCADE,
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  claimer_member_id uuid NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'considering',
  notes text,
  tracked_price numeric(10,2),
  tracked_store text,
  tracked_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wishlist_claims_status_check CHECK (status IN ('considering','purchased','gifted')),
  CONSTRAINT wishlist_claims_unique UNIQUE (wishlist_item_id, claimer_member_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_claims TO authenticated;
GRANT ALL ON public.wishlist_claims TO service_role;

ALTER TABLE public.wishlist_claims ENABLE ROW LEVEL SECURITY;

-- The recipient of a wish must never see its claims (surprise gifts).
CREATE OR REPLACE FUNCTION public.can_view_wishlist_claim(_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wishlist_items i
    JOIN public.household_members recipient ON recipient.id = i.for_member_id
    WHERE i.id = _item_id
      AND public.is_household_member(i.household_id, auth.uid())
      AND (recipient.user_id IS NULL OR recipient.user_id <> auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION public.can_view_wishlist_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_wishlist_claim(uuid) TO authenticated, service_role;

CREATE POLICY "Members can view claims except the recipient"
ON public.wishlist_claims FOR SELECT TO authenticated
USING (public.can_view_wishlist_claim(wishlist_item_id));

CREATE POLICY "Members can claim wishes of others"
ON public.wishlist_claims FOR INSERT TO authenticated
WITH CHECK (
  public.can_view_wishlist_claim(wishlist_item_id)
  AND EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = claimer_member_id
      AND m.household_id = wishlist_claims.household_id
      AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Claimers can update their own claims"
ON public.wishlist_claims FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = claimer_member_id AND m.user_id = auth.uid()
  )
)
WITH CHECK (
  public.can_view_wishlist_claim(wishlist_item_id)
  AND EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = claimer_member_id AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Claimers can delete their own claims"
ON public.wishlist_claims FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = claimer_member_id AND m.user_id = auth.uid()
  )
);

CREATE TRIGGER trg_wishlist_claims_updated_at
BEFORE UPDATE ON public.wishlist_claims
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_wishlist_items_household ON public.wishlist_items(household_id);
CREATE INDEX idx_wishlist_claims_item ON public.wishlist_claims(wishlist_item_id);
