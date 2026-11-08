import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendPushToUsers } from "./notify.server";
import { sendTelegramToUsers } from "./notify.server";

export const NOTICE_TEMPLATES = {
  shopping_added: "ha añadido productos a la lista de la compra.",
  shopping_completed: "ha marcado una compra como realizada.",
  task_created: "ha creado una tarea del hogar.",
  task_completed: "ha completado una tarea del hogar.",
  medication_due: "tiene una medicación pendiente.",
  medication_taken: "ha registrado una toma de medicación.",
} as const;
const PublishInput = z.object({
  body: z.string().trim().min(1).max(140),
  template: z.enum(["shopping_added", "shopping_completed", "task_created", "task_completed", "medication_due", "medication_taken"]).optional(),
});
const IdInput = z.object({ id: z.string().uuid() });

async function household(supabase: any) {
  const { data, error } = await supabase.rpc("current_household");
  if (error || !data) throw new Error("No household");
  return data as string;
}

export const listHouseholdNotices = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const householdId = await household(context.supabase);
  const { data, error } = await context.supabase.from("notifications").select("id,title,body,type,data,created_at,user_id").eq("household_id", householdId).eq("type", "household_notice").is("read_at", null).order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return data ?? [];
});

export const publishHouseholdNotice = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => PublishInput.parse(input)).handler(async ({ data, context }) => {
  const householdId = await household(context.supabase);
  const { data: member } = await context.supabase.from("household_members").select("display_name").eq("household_id", householdId).eq("user_id", context.userId).maybeSingle();
  const author = member?.display_name || "Un miembro";
  const text = data.template ? NOTICE_TEMPLATES[data.template] : data.body;
  const title = "Aviso del hogar";
  const { data: recipients } = await context.supabase.from("household_members").select("user_id").eq("household_id", householdId).not("user_id", "is", null);
  const userIds = (recipients ?? []).map((r: any) => r.user_id).filter((id: string) => id !== context.userId);
  const rows = userIds.map((userId: string) => ({ household_id: householdId, user_id: userId, title, body: `${author}: ${text}`, type: "household_notice", data: { author_id: context.userId, template: data.template ?? null } }));
  const { error } = rows.length ? await context.supabase.from("notifications").insert(rows) : { error: null };
  if (error) throw error;
  const externalBody = `${author} ha publicado un nuevo aviso del hogar.`;
  await sendPushToUsers(context.supabase, userIds, { title, body: externalBody, url: "/dashboard" });
  await sendTelegramToUsers(context.supabase, userIds, `${title}\n${externalBody}`, undefined, null);
  return { ok: true, deliveredTo: userIds.length };
});

export const dismissHouseholdNotice = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((input) => IdInput.parse(input)).handler(async ({ data, context }) => {
  const householdId = await household(context.supabase);
  const { error } = await context.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", data.id).eq("household_id", householdId).eq("user_id", context.userId);
  if (error) throw error;
  return { ok: true };
});
