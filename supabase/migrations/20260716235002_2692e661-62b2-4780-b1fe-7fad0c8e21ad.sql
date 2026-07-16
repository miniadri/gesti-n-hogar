
CREATE TABLE public.appliances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gas','induccion','vitroceramica','horno','airfryer','microondas','olla_expres','procesador','manual','otro')),
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appliances TO authenticated;
GRANT ALL ON public.appliances TO service_role;
ALTER TABLE public.appliances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household members manage appliances"
  ON public.appliances FOR ALL TO authenticated
  USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE TABLE public.recipe_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  text TEXT NOT NULL,
  base_minutes INT DEFAULT 0,
  technique TEXT,
  is_prep_ahead BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recipe_id, step_order)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_steps TO authenticated;
GRANT ALL ON public.recipe_steps TO service_role;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household members manage recipe steps"
  ON public.recipe_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND public.is_household_member(r.household_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipes r WHERE r.id = recipe_id AND public.is_household_member(r.household_id, auth.uid())));

CREATE TABLE public.recipe_step_appliance_times (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  step_id UUID NOT NULL REFERENCES public.recipe_steps(id) ON DELETE CASCADE,
  appliance_type TEXT NOT NULL,
  minutes INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (step_id, appliance_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_step_appliance_times TO authenticated;
GRANT ALL ON public.recipe_step_appliance_times TO service_role;
ALTER TABLE public.recipe_step_appliance_times ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Household members manage step times"
  ON public.recipe_step_appliance_times FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recipe_steps s JOIN public.recipes r ON r.id = s.recipe_id WHERE s.id = step_id AND public.is_household_member(r.household_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.recipe_steps s JOIN public.recipes r ON r.id = s.recipe_id WHERE s.id = step_id AND public.is_household_member(r.household_id, auth.uid())));

ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS meal_type TEXT NOT NULL DEFAULT 'ambas' CHECK (meal_type IN ('comida','cena','ambas')),
  ADD COLUMN IF NOT EXISTS protein_group TEXT CHECK (protein_group IN ('carne','pescado','legumbre','huevo','vegetal','otro')),
  ADD COLUMN IF NOT EXISTS has_main_veg BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS difficulty TEXT CHECK (difficulty IN ('facil','media','dificil'));

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS unit TEXT,
  ADD COLUMN IF NOT EXISTS is_optional BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.meal_plan_days
  ADD COLUMN IF NOT EXISTS lunch_manual TEXT,
  ADD COLUMN IF NOT EXISTS dinner_manual TEXT,
  ADD COLUMN IF NOT EXISTS lunch_skipped BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dinner_skipped BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lunch_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dinner_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS servings INT NOT NULL DEFAULT 2;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_appliances_updated_at ON public.appliances;
CREATE TRIGGER trg_appliances_updated_at BEFORE UPDATE ON public.appliances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_recipe_steps_updated_at ON public.recipe_steps;
CREATE TRIGGER trg_recipe_steps_updated_at BEFORE UPDATE ON public.recipe_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_recipe_steps_recipe ON public.recipe_steps(recipe_id, step_order);
CREATE INDEX IF NOT EXISTS idx_appliances_household ON public.appliances(household_id);
