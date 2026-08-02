ALTER TABLE public.schedule_settings
ADD COLUMN IF NOT EXISTS notify_household boolean NOT NULL DEFAULT false;

UPDATE public.schedule_settings s
SET notify_household = true
FROM public.household_members m
WHERE m.id = s.member_id
  AND m.is_child = true
  AND s.notify_household = false;
