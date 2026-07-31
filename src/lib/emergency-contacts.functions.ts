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

export const listEmergencyRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) return { members: [], externalContacts: [], totalReachable: 0 };

    const { data: members, error: membersError } = await context.supabase
      .from("household_members")
      .select("id, user_id, display_name, is_child, is_emergency_contact")
      .eq("household_id", householdId)
      .eq("is_child", false)
      .not("user_id", "is", null)
      .order("display_name");
    if (membersError) throw membersError;

    const userIds = ((members ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
    const [{ data: telegramProfiles }, { data: pushSubscriptions }, { data: externalContacts, error: contactsError }] =
      await Promise.all([
        context.supabase
          .from("telegram_profiles")
          .select("user_id")
          .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
        context.supabase
          .from("push_subscriptions")
          .select("user_id")
          .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
        context.supabase
          .from("emergency_contacts")
          .select("id, name, phone, telegram_chat_id")
          .eq("household_id", householdId)
          .order("name"),
      ]);
    if (contactsError) throw contactsError;

    const telegramUsers = new Set(((telegramProfiles ?? []) as any[]).map((p) => p.user_id));
    const pushUsers = new Set(((pushSubscriptions ?? []) as any[]).map((p) => p.user_id));
    const adults = (members ?? []) as any[];
    const flagged = adults.filter((m) => m.is_emergency_contact);
    const targetMemberIds = new Set((flagged.length ? flagged : adults).map((m) => m.id));

    const memberRecipients = adults.map((m) => {
      const telegram = telegramUsers.has(m.user_id);
      const push = pushUsers.has(m.user_id);
      return {
        id: m.id,
        name: m.display_name ?? "Miembro",
        selected: targetMemberIds.has(m.id),
        fallback: flagged.length === 0,
        telegram,
        push,
        reachable: targetMemberIds.has(m.id) && (telegram || push),
      };
    });

    const externalRecipients = ((externalContacts ?? []) as any[]).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      telegram: Boolean(c.telegram_chat_id),
      push: false,
      reachable: Boolean(c.telegram_chat_id),
    }));

    return {
      members: memberRecipients,
      externalContacts: externalRecipients,
      totalReachable:
        memberRecipients.filter((m) => m.reachable).length +
        externalRecipients.filter((c) => c.reachable).length,
    };
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
