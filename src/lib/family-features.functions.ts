import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DayKey, PreferenceSchema } from "./family-features";

async function identity(context: { supabase: any; userId: string }) {
  const { data: householdId, error } = await context.supabase.rpc("current_household");
  if (error) throw error;
  if (!householdId) throw new Error("No hay hogar activo");
  const { data: member, error: memberError } = await context.supabase
    .from("household_members")
    .select("id, display_name, user_id")
    .eq("household_id", householdId)
    .eq("user_id", context.userId)
    .single();
  if (memberError || !member || member.display_name === "Kiosko cocina")
    throw new Error("Se requiere una cuenta personal del hogar");
  return {
    householdId: householdId as string,
    userId: context.userId,
    memberId: member.id as string,
  };
}

export const getFamilyFeatureContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await identity(context);
    const { data, error } = await context.supabase
      .from("household_members")
      .select("id, user_id, display_name, is_child")
      .eq("household_id", owner.householdId)
      .not("user_id", "is", null)
      .neq("display_name", "Kiosko cocina");
    if (error) throw error;
    return { ...owner, members: data ?? [] };
  });

export const listPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await identity(context);
    const { data, error } = await (context.supabase as any)
      .from("member_preferences")
      .select("*")
      .eq("household_id", owner.householdId);
    if (error) throw error;
    return (data ?? []) as Array<{
      owner_user_id: string;
      block: string;
      details: string;
      visibility: string;
      recipients: string[];
      revision: number;
    }>;
  });

export const savePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PreferenceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const owner = await identity(context);
    const { data: result, error } = await (context.supabase as any).rpc("save_member_preference", {
      _household: owner.householdId,
      _block: data.block,
      _details: data.details,
      _visibility: data.visibility,
      _recipients: data.visibility === "selected" ? [...new Set(data.recipients)] : [],
      _revision: data.revision,
    });
    if (error) throw new Error(error.message);
    return result;
  });

const CycleShareInput = z
  .object({
    enabled: z.boolean(),
    start: DayKey.nullable(),
    end: DayKey.nullable(),
    next: DayKey.nullable(),
    recipients: z.array(z.string().uuid()).max(100),
  })
  .strict()
  .refine(
    (value) => !value.enabled || (value.start && value.recipients.length > 0),
    "Selecciona registros y destinatarios",
  )
  .refine((value) => !value.start || !value.end || value.end >= value.start, "Fechas no válidas");

export const listCycleShares = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await identity(context);
    const { data, error } = await (context.supabase as any)
      .from("cycle_shared_summaries")
      .select("*")
      .eq("household_id", owner.householdId);
    if (error) throw error;
    return (data ?? []) as Array<{
      owner_user_id: string;
      start_date: string;
      end_date: string | null;
      next_date: string | null;
      recipients: string[];
    }>;
  });

export const setCycleSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CycleShareInput.parse(input))
  .handler(async ({ data, context }) => {
    const owner = await identity(context);
    const table = (context.supabase as any).from("cycle_shared_summaries");
    const response = data.enabled
      ? await table.upsert(
          {
            household_id: owner.householdId,
            owner_user_id: owner.userId,
            start_date: data.start,
            end_date: data.end,
            next_date: data.next,
            recipients: [...new Set(data.recipients)],
          },
          { onConflict: "household_id,owner_user_id" },
        )
      : await table
          .delete()
          .eq("household_id", owner.householdId)
          .eq("owner_user_id", owner.userId);
    if (response.error) throw response.error;
    return { ok: true };
  });

export const setCycleReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ due: z.string().datetime().nullable(), next: DayKey.nullable() })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const owner = await identity(context);
    const table = (context.supabase as any).from("personal_cycle_reminders");
    if (
      data.due &&
      (!data.next ||
        Date.parse(data.due) < Date.now() - 60_000 ||
        Date.parse(data.due) > Date.now() + 370 * 86_400_000)
    )
      throw new Error("Elige una fecha futura de aviso dentro del próximo año");
    const { error } = data.due
      ? await (context.supabase as any).rpc("save_personal_cycle_reminder", {
          _household: owner.householdId,
          _due: data.due,
          _next: data.next,
        })
      : await table
          .delete()
          .eq("household_id", owner.householdId)
          .eq("owner_user_id", owner.userId);
    if (error) throw error;
    return { ok: true };
  });

export const getCycleReminder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const owner = await identity(context);
    const { data, error } = await (context.supabase as any)
      .from("personal_cycle_reminders")
      .select("due_at, expected_date, notified_at, attempts")
      .eq("household_id", owner.householdId)
      .eq("owner_user_id", owner.userId)
      .maybeSingle();
    if (error) throw error;
    return data as {
      due_at: string;
      expected_date: string;
      notified_at: string | null;
      attempts: number;
    } | null;
  });
