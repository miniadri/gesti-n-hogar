ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz;
ALTER TABLE public.medicines ADD COLUMN IF NOT EXISTS expiry_notified_at timestamptz;