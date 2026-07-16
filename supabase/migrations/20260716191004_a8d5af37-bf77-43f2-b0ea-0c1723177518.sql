
-- 1. Extend salaries with contribution info; make amount optional
ALTER TABLE public.salaries
  ALTER COLUMN amount DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS contribution_type text NOT NULL DEFAULT 'percentage' CHECK (contribution_type IN ('percentage','fixed')),
  ADD COLUMN IF NOT EXISTS contribution_value numeric NOT NULL DEFAULT 0;

-- 2. Add critical threshold to households
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS critical_threshold_percent int NOT NULL DEFAULT 85 CHECK (critical_threshold_percent BETWEEN 1 AND 100);

-- 3. Tighten salaries RLS: only the salary owner (member linked to auth.uid()) sees full row
DROP POLICY IF EXISTS "Household members can manage salaries" ON public.salaries;

CREATE POLICY "Owner can read own salary"
ON public.salaries FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = salaries.member_id AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can insert own salary"
ON public.salaries FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = salaries.member_id AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can update own salary"
ON public.salaries FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = salaries.member_id AND m.user_id = auth.uid()
  )
);

CREATE POLICY "Owner can delete own salary"
ON public.salaries FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.household_members m
    WHERE m.id = salaries.member_id AND m.user_id = auth.uid()
  )
);

-- 4. SECURITY DEFINER function: any household member can see contribution amounts (not salaries)
CREATE OR REPLACE FUNCTION public.get_household_contributions(_household_id uuid)
RETURNS TABLE (
  member_id uuid,
  display_name text,
  is_child boolean,
  contribution_type text,
  contribution_value numeric,
  contribution_amount numeric,
  has_income boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id AS member_id,
    m.display_name,
    m.is_child,
    COALESCE(s.contribution_type, 'percentage') AS contribution_type,
    COALESCE(s.contribution_value, 0) AS contribution_value,
    CASE
      WHEN s.contribution_type = 'fixed' THEN COALESCE(s.contribution_value, 0)
      WHEN s.contribution_type = 'percentage' AND s.amount IS NOT NULL
        THEN ROUND(COALESCE(s.amount, 0) * COALESCE(s.contribution_value, 0) / 100.0, 2)
      ELSE 0
    END AS contribution_amount,
    (s.amount IS NOT NULL) AS has_income
  FROM public.household_members m
  LEFT JOIN public.salaries s ON s.member_id = m.id
  WHERE m.household_id = _household_id
    AND m.is_child = false
    AND public.is_household_member(_household_id, auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_household_contributions(uuid) TO authenticated;
