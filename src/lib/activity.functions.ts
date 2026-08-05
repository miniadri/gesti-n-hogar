import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ActivityInput = {
  domain: "inventory" | "shopping" | "receipt";
  action: string;
  title: string;
  details?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, any>;
};

export async function logHouseholdActivity(
  supabase: any,
  householdId: string,
  actorUserId: string,
  activity: ActivityInput,
) {
  try {
    await supabase.from("household_activity").insert({
      household_id: householdId,
      actor_user_id: actorUserId,
      domain: activity.domain,
      action: activity.action,
      title: activity.title,
      details: activity.details ?? null,
      entity_type: activity.entityType ?? null,
      entity_id: activity.entityId ?? null,
      metadata: activity.metadata ?? {},
    });
  } catch (err) {
    console.warn("[activity] Could not log household activity", err);
  }
}

const ListActivityInput = z.object({
  domain: z.enum(["inventory", "shopping", "receipt"]).optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const listHouseholdActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListActivityInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    let query = (context.supabase as any)
      .from("household_activity")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.domain) query = query.eq("domain", data.domain);

    const { data: rows, error } = await query;
    if (error) throw error;

    const actorIds = Array.from(
      new Set<string>((rows ?? []).map((row: any) => row.actor_user_id).filter(Boolean)),
    );

    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: members } = await context.supabase
        .from("household_members")
        .select("user_id, display_name")
        .eq("household_id", householdId)
        .in("user_id", actorIds);

      for (const member of members ?? []) {
        if (member.user_id) actorNames.set(member.user_id, member.display_name);
      }
    }

    return (rows ?? []).map((row: any) => ({
      ...row,
      actor_name: actorNames.get(row.actor_user_id) ?? "Usuario",
    }));
  });
