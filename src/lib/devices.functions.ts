import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DeviceInput = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["light", "thermostat", "security", "other"]).default("other"),
  room: z.string().optional(),
  status: z.enum(["on", "off"]).default("off"),
  next_maintenance: z.string().date().optional(),
});

const UpdateDeviceInput = DeviceInput.partial().extend({ id: z.string().uuid() });
const DeleteDeviceInput = z.object({ id: z.string().uuid() });

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("devices")
      .select("*")
      .eq("household_id", householdId)
      .order("name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const createDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeviceInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: device, error } = await context.supabase
      .from("devices")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return device;
  });

export const updateDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateDeviceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: device, error } = await context.supabase
      .from("devices")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return device;
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteDeviceInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("devices").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
