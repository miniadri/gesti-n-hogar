import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ContactInput = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40).nullable().optional(),
  telegram_chat_id: z.string().max(40).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
const UpdateInput = ContactInput.partial().extend({ id: z.string().uuid() });
const IdInput = z.object({ id: z.string().uuid() });

export const listEmergencyContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) return [];
    const { data, error } = await context.supabase
      .from("emergency_contacts")
      .select("*")
      .eq("household_id", householdId)
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const createEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ContactInput.parse(i))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const { data: row, error } = await context.supabase
      .from("emergency_contacts")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => UpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("emergency_contacts")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => IdInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("emergency_contacts")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const ToggleEmergencyMemberInput = z.object({
  member_id: z.string().uuid(),
  is_emergency_contact: z.boolean(),
});

export const setMemberEmergencyContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ToggleEmergencyMemberInput.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("household_members")
      .update({ is_emergency_contact: data.is_emergency_contact })
      .eq("id", data.member_id);
    if (error) throw error;
    return { ok: true };
  });
