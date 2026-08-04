import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProfileInput = z.object({
  member_id: z.string().uuid(),
  blood_type: z.string().max(10).nullable().optional(),
  height_cm: z.number().positive().max(260).nullable().optional(),
  weight_kg: z.number().positive().max(400).nullable().optional(),
  public_health_provider: z.string().max(120).nullable().optional(),
  public_health_id: z.string().max(120).nullable().optional(),
  private_insurance_name: z.string().max(120).nullable().optional(),
  private_policy_number: z.string().max(120).nullable().optional(),
  private_coverage_notes: z.string().max(1000).nullable().optional(),
  emergency_notes: z.string().max(1000).nullable().optional(),
  show_in_sos: z.boolean().optional(),
});

const RecordType = z.enum(["condition", "allergy", "visit", "note", "procedure", "vaccine", "other"]);
const Severity = z.enum(["low", "medium", "high", "critical"]);

const RecordInput = z.object({
  member_id: z.string().uuid(),
  record_type: RecordType,
  title: z.string().min(1).max(180),
  severity: Severity.nullable().optional(),
  occurred_on: z.string().date().nullable().optional(),
  follow_up_on: z.string().date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  show_in_sos: z.boolean().optional(),
});

const UpdateRecordInput = RecordInput.partial().extend({
  id: z.string().uuid(),
});

async function requireAdultHousehold(context: any): Promise<string> {
  const householdId = (await context.supabase.rpc("current_household")).data as string | null;
  if (!householdId) throw new Error("No household");
  const { data, error } = await context.supabase
    .from("household_members")
    .select("id, is_child")
    .eq("household_id", householdId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.is_child) throw new Error("No autorizado para ver el registro médico");
  return householdId;
}

export const listMedicalRegistry = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await requireAdultHousehold(context);

    const [{ data: members }, { data: profiles }, { data: records }] = await Promise.all([
      context.supabase
        .from("household_members")
        .select("id, display_name, is_child, user_id")
        .eq("household_id", householdId)
        .order("display_name"),
      (context.supabase as any)
        .from("medical_profiles")
        .select("*")
        .eq("household_id", householdId),
      (context.supabase as any)
        .from("medical_records")
        .select("*")
        .eq("household_id", householdId)
        .order("created_at", { ascending: false }),
    ]);

    return {
      members: members ?? [],
      profiles: profiles ?? [],
      records: records ?? [],
    };
  });

export const upsertMedicalProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await requireAdultHousehold(context);
    const payload = {
      household_id: householdId,
      member_id: data.member_id,
      blood_type: data.blood_type ?? null,
      height_cm: data.height_cm ?? null,
      weight_kg: data.weight_kg ?? null,
      public_health_provider: data.public_health_provider ?? null,
      public_health_id: data.public_health_id ?? null,
      private_insurance_name: data.private_insurance_name ?? null,
      private_policy_number: data.private_policy_number ?? null,
      private_coverage_notes: data.private_coverage_notes ?? null,
      emergency_notes: data.emergency_notes ?? null,
      show_in_sos: data.show_in_sos ?? true,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await (context.supabase as any)
      .from("medical_profiles")
      .upsert(payload, { onConflict: "member_id" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const createMedicalRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RecordInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await requireAdultHousehold(context);
    const { data: row, error } = await (context.supabase as any)
      .from("medical_records")
      .insert({
        household_id: householdId,
        member_id: data.member_id,
        record_type: data.record_type,
        title: data.title.trim(),
        severity: data.severity ?? null,
        occurred_on: data.occurred_on ?? null,
        follow_up_on: data.follow_up_on ?? null,
        notes: data.notes ?? null,
        show_in_sos: data.show_in_sos ?? false,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateMedicalRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateRecordInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdultHousehold(context);
    const { id, ...rest } = data;
    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined) patch[key] = typeof value === "string" ? value.trim() : value;
    }
    const { data: row, error } = await (context.supabase as any)
      .from("medical_records")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteMedicalRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdultHousehold(context);
    const { error } = await (context.supabase as any).from("medical_records").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
