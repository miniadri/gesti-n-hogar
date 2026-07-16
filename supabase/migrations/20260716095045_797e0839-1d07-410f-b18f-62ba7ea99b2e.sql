-- HomeSync initial schema

-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'member', 'child');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'es',
  preferred_currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Households
CREATE TABLE public.households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Household members
CREATE TABLE public.household_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  is_child BOOLEAN NOT NULL DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, user_id)
);

-- User roles (separate table as required)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  UNIQUE (user_id, household_id)
);

-- Helper: check if a user has a role in user_roles (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Helper: current household for the requesting user
CREATE OR REPLACE FUNCTION public.current_household()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id FROM public.household_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Household invites
CREATE TABLE public.household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  role app_role NOT NULL DEFAULT 'member',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stores (for shopping lists)
CREATE TABLE public.stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, name)
);

-- Tasks
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.household_members(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  category TEXT,
  due_date TIMESTAMPTZ,
  recurrence TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Calendar events
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  category TEXT,
  attendees UUID[] DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'local',
  external_id TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory items
CREATE TABLE public.inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  min_stock NUMERIC DEFAULT 0,
  location TEXT,
  expiry_date DATE,
  last_price NUMERIC,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shopping lists
CREATE TABLE public.shopping_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  date DATE,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shopping list items
CREATE TABLE public.shopping_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopping_list_id UUID NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  manual_price NUMERIC,
  ocr_price NUMERIC,
  image_url TEXT,
  checked BOOLEAN NOT NULL DEFAULT false,
  linked_inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expense categories
CREATE TABLE public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Expenses
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  paid_by UUID REFERENCES public.household_members(id) ON DELETE SET NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_subscription BOOLEAN NOT NULL DEFAULT false,
  recurrence TEXT,
  receipt_id UUID,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Budgets
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  period TEXT NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Salaries (for contribution calculations)
CREATE TABLE public.salaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.household_members(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (household_id, member_id, effective_from)
);

-- Recipes
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  prep_time INTEGER,
  cook_time INTEGER,
  servings INTEGER,
  dietary_tags TEXT[],
  source TEXT NOT NULL DEFAULT 'manual',
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Recipe ingredients
CREATE TABLE public.recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  is_optional BOOLEAN NOT NULL DEFAULT false
);

-- Meal plans
CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meal plan days
CREATE TABLE public.meal_plan_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  breakfast_recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  lunch_recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  dinner_recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  snack_recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL
);

-- Devices / smart home
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'off',
  room TEXT,
  next_maintenance DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Device schedules
CREATE TABLE public.device_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time TIME NOT NULL,
  action TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true
);

-- Notifications (in-app)
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Push subscriptions
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipts / OCR
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  total NUMERIC,
  receipt_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt items
CREATE TABLE public.receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC,
  total_price NUMERIC,
  category TEXT
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, preferred_language, preferred_currency)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'es', 'EUR')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create default household on first profile insert
CREATE OR REPLACE FUNCTION public.handle_default_household()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.household_members WHERE user_id = NEW.id) THEN
    INSERT INTO public.households (name, created_by)
    VALUES ('Mi hogar', NEW.id)
    RETURNING id INTO new_household_id;

    INSERT INTO public.household_members (household_id, user_id, display_name)
    VALUES (new_household_id, NEW.id, COALESCE(NEW.full_name, 'Yo'));

    INSERT INTO public.user_roles (user_id, role, household_id)
    VALUES (NEW.id, 'admin', new_household_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_profile_created_default_household
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_default_household();

-- GRANTS
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

GRANT SELECT, INSERT, DELETE ON public.household_invites TO authenticated;
GRANT ALL ON public.household_invites TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_lists TO authenticated;
GRANT ALL ON public.shopping_lists TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_list_items TO authenticated;
GRANT ALL ON public.shopping_list_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budgets TO authenticated;
GRANT ALL ON public.budgets TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.salaries TO authenticated;
GRANT ALL ON public.salaries TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipe_ingredients TO authenticated;
GRANT ALL ON public.recipe_ingredients TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plans TO authenticated;
GRANT ALL ON public.meal_plans TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plan_days TO authenticated;
GRANT ALL ON public.meal_plan_days TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_schedules TO authenticated;
GRANT ALL ON public.device_schedules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT, INSERT, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipts TO authenticated;
GRANT ALL ON public.receipts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_items TO authenticated;
GRANT ALL ON public.receipt_items TO service_role;

-- RLS ENABLE
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Household members can read households" ON public.households FOR SELECT USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = households.id AND user_id = auth.uid()));
CREATE POLICY "Creator can update/delete households" ON public.households FOR ALL USING (created_by = auth.uid());

CREATE POLICY "Members can read household members" ON public.household_members FOR SELECT USING (EXISTS (SELECT 1 FROM public.household_members m WHERE m.household_id = household_members.household_id AND m.user_id = auth.uid()));
CREATE POLICY "Admins can manage household members" ON public.household_members FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members m WHERE m.household_id = household_members.household_id AND m.user_id = auth.uid() AND public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.household_members WHERE household_id = user_roles.household_id AND user_id = auth.uid()));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = user_roles.household_id AND user_id = auth.uid() AND public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Members can read invites" ON public.household_invites FOR SELECT USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = household_invites.household_id AND user_id = auth.uid()));
CREATE POLICY "Admins can manage invites" ON public.household_invites FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = household_invites.household_id AND user_id = auth.uid() AND public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Household members can manage stores" ON public.stores FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = stores.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage tasks" ON public.tasks FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = tasks.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage events" ON public.calendar_events FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = calendar_events.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage inventory" ON public.inventory_items FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = inventory_items.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage shopping lists" ON public.shopping_lists FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = shopping_lists.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage shopping list items" ON public.shopping_list_items FOR ALL USING (EXISTS (SELECT 1 FROM public.shopping_lists sl JOIN public.household_members m ON sl.household_id = m.household_id WHERE sl.id = shopping_list_items.shopping_list_id AND m.user_id = auth.uid()));
CREATE POLICY "Household members can manage categories" ON public.expense_categories FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = expense_categories.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage expenses" ON public.expenses FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = expenses.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage budgets" ON public.budgets FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = budgets.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage salaries" ON public.salaries FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = salaries.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage recipes" ON public.recipes FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = recipes.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage recipe ingredients" ON public.recipe_ingredients FOR ALL USING (EXISTS (SELECT 1 FROM public.recipes r JOIN public.household_members m ON r.household_id = m.household_id WHERE r.id = recipe_ingredients.recipe_id AND m.user_id = auth.uid()));
CREATE POLICY "Household members can manage meal plans" ON public.meal_plans FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = meal_plans.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage meal plan days" ON public.meal_plan_days FOR ALL USING (EXISTS (SELECT 1 FROM public.meal_plans mp JOIN public.household_members m ON mp.household_id = m.household_id WHERE mp.id = meal_plan_days.meal_plan_id AND m.user_id = auth.uid()));
CREATE POLICY "Household members can manage devices" ON public.devices FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = devices.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage device schedules" ON public.device_schedules FOR ALL USING (EXISTS (SELECT 1 FROM public.devices d JOIN public.household_members m ON d.household_id = m.household_id WHERE d.id = device_schedules.device_id AND m.user_id = auth.uid()));

CREATE POLICY "Users can read own household notifications" ON public.notifications FOR SELECT USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = notifications.household_id AND user_id = auth.uid()));
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.household_members WHERE household_id = notifications.household_id AND user_id = auth.uid()));
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = notifications.household_id AND user_id = auth.uid() AND public.has_role(auth.uid(), 'admin')));

CREATE POLICY "Users can manage own push subscriptions" ON public.push_subscriptions FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Household members can manage receipts" ON public.receipts FOR ALL USING (EXISTS (SELECT 1 FROM public.household_members WHERE household_id = receipts.household_id AND user_id = auth.uid()));
CREATE POLICY "Household members can manage receipt items" ON public.receipt_items FOR ALL USING (EXISTS (SELECT 1 FROM public.receipts r JOIN public.household_members m ON r.household_id = m.household_id WHERE r.id = receipt_items.receipt_id AND m.user_id = auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
