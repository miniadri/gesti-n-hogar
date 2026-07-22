-- Enable full row payloads on UPDATE/DELETE so realtime clients receive complete data
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER TABLE public.expenses REPLICA IDENTITY FULL;
ALTER TABLE public.budgets REPLICA IDENTITY FULL;
ALTER TABLE public.shopping_lists REPLICA IDENTITY FULL;
ALTER TABLE public.shopping_list_items REPLICA IDENTITY FULL;
ALTER TABLE public.inventory_items REPLICA IDENTITY FULL;
ALTER TABLE public.medicines REPLICA IDENTITY FULL;
ALTER TABLE public.meal_plans REPLICA IDENTITY FULL;
ALTER TABLE public.meal_plan_days REPLICA IDENTITY FULL;
ALTER TABLE public.calendar_events REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.household_members REPLICA IDENTITY FULL;
ALTER TABLE public.households REPLICA IDENTITY FULL;

-- Add tables to the realtime publication (idempotent guards)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'tasks','expenses','budgets','shopping_lists','shopping_list_items',
    'inventory_items','medicines','meal_plans','meal_plan_days',
    'calendar_events','notifications','household_members','households'
  ]) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;