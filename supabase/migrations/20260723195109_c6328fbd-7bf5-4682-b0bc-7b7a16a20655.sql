-- Replace partial unique indexes with a real unique constraint so PostgREST upsert onConflict works
DROP INDEX IF EXISTS public.devices_household_external_uidx;
DROP INDEX IF EXISTS public.devices_household_source_external_key;
ALTER TABLE public.devices
  ADD CONSTRAINT devices_household_source_external_key
  UNIQUE (household_id, external_source, external_id);