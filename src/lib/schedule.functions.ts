import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SlotKind = z.enum(["work", "subject", "extracurricular", "break", "off"]);
const DayState = z.enum(["normal", "vacation", "holiday", "sick", "off"]);
const TimeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

/** List household members with their schedule settings (respecting sharing). */
export const listScheduleMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    if (!householdId) return [];
    const { data: members, error } = await context.supabase
      .from("household_members")
      .select("id, display_name, is_child, user_id, avatar_url")
      .eq("household_id", householdId)
      .order("is_child", { ascending: true })
      .order("display_name", { ascending: true });
    if (error) throw error;
    const { data: settings } = await context.supabase.from("schedule_settings").select("*");
    const byMember = new Map<string, any>((settings ?? []).map((s: any) => [s.member_id, s]));
    return (members ?? []).map((m: any) => ({
      ...m,
      is_self: m.user_id === context.userId,
      settings: byMember.get(m.id) ?? null,
    }));
  });

const UpsertSettingsInput = z.object({
  member_id: z.string().uuid(),
  kind: z.enum(["work", "school"]).optional(),
  target_hours_per_day: z.number().min(0).max(24).optional(),
  vacation_days_per_month: z.number().min(0).max(31).optional(),
  vacation_start_date: z.string().optional(),
  use_template: z.boolean().optional(),
  is_shared: z.boolean().optional(),
  notify_household: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const upsertScheduleSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpsertSettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    if (!householdId) throw new Error("No household");
    // fetch existing
    const { data: existing } = await context.supabase
      .from("schedule_settings")
      .select("id")
      .eq("member_id", data.member_id)
      .maybeSingle();
    const payload: any = {
      member_id: data.member_id,
      household_id: householdId,
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.target_hours_per_day !== undefined ? { target_hours_per_day: data.target_hours_per_day } : {}),
      ...(data.vacation_days_per_month !== undefined ? { vacation_days_per_month: data.vacation_days_per_month } : {}),
      ...(data.vacation_start_date ? { vacation_start_date: data.vacation_start_date } : {}),
      ...(data.use_template !== undefined ? { use_template: data.use_template } : {}),
      ...(data.is_shared !== undefined ? { is_shared: data.is_shared } : {}),
      ...(data.notify_household !== undefined ? { notify_household: data.notify_household } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    };
    if (existing) {
      const { data: row, error } = await context.supabase
        .from("schedule_settings")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("schedule_settings")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

const MemberRange = z.object({
  member_id: z.string().uuid(),
  from: z.string(), // date
  to: z.string(),
});

export const getMemberSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MemberRange.parse(input))
  .handler(async ({ data, context }) => {
    const [settingsRes, templateRes, dayRes, statusRes] = await Promise.all([
      context.supabase.from("schedule_settings").select("*").eq("member_id", data.member_id).maybeSingle(),
      context.supabase.from("schedule_template_slots").select("*").eq("member_id", data.member_id).order("day_of_week").order("start_time"),
      context.supabase
        .from("schedule_day_slots")
        .select("*")
        .eq("member_id", data.member_id)
        .gte("date", data.from)
        .lte("date", data.to)
        .order("date")
        .order("start_time"),
      context.supabase
        .from("schedule_day_status")
        .select("*")
        .eq("member_id", data.member_id)
        .gte("date", data.from)
        .lte("date", data.to),
    ]);
    if (settingsRes.error) throw settingsRes.error;
    if (templateRes.error) throw templateRes.error;
    if (dayRes.error) throw dayRes.error;
    if (statusRes.error) throw statusRes.error;
    return {
      settings: settingsRes.data,
      template: templateRes.data ?? [],
      days: dayRes.data ?? [],
      status: statusRes.data ?? [],
    };
  });

const TemplateSlotInput = z.object({
  id: z.string().uuid().optional(),
  member_id: z.string().uuid(),
  day_of_week: z.number().int().min(0).max(6),
  start_time: TimeStr,
  end_time: TimeStr,
  slot_kind: SlotKind.default("work"),
  label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const upsertTemplateSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TemplateSlotInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    if (!householdId) throw new Error("No household");
    const payload: any = {
      member_id: data.member_id,
      household_id: householdId,
      day_of_week: data.day_of_week,
      start_time: data.start_time,
      end_time: data.end_time,
      slot_kind: data.slot_kind,
      label: data.label ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("schedule_template_slots")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("schedule_template_slots")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteTemplateSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("schedule_template_slots").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const DaySlotInput = z.object({
  id: z.string().uuid().optional(),
  member_id: z.string().uuid(),
  date: z.string(),
  start_time: TimeStr,
  end_time: TimeStr,
  slot_kind: SlotKind.default("work"),
  label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const upsertDaySlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DaySlotInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    if (!householdId) throw new Error("No household");
    const payload: any = {
      member_id: data.member_id,
      household_id: householdId,
      date: data.date,
      start_time: data.start_time,
      end_time: data.end_time,
      slot_kind: data.slot_kind,
      label: data.label ?? null,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("schedule_day_slots")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("schedule_day_slots")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteDaySlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("schedule_day_slots").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const DayStatusInput = z.object({
  member_id: z.string().uuid(),
  date: z.string(),
  state: DayState.optional(),
  overtime_hours: z.number().min(-24).max(24).optional(),
  use_day_override: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

export const upsertDayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DayStatusInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    if (!householdId) throw new Error("No household");
    const payload: any = {
      member_id: data.member_id,
      household_id: householdId,
      date: data.date,
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.overtime_hours !== undefined ? { overtime_hours: data.overtime_hours } : {}),
      ...(data.use_day_override !== undefined ? { use_day_override: data.use_day_override } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    };
    const { data: row, error } = await context.supabase
      .from("schedule_day_status")
      .upsert(payload, { onConflict: "member_id,date" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

/** Copy all template slots from source day of week to target day(s). Utility helper. */
const CopyTemplateInput = z.object({
  member_id: z.string().uuid(),
  from_day: z.number().int().min(0).max(6),
  to_days: z.array(z.number().int().min(0).max(6)).min(1),
});
export const copyTemplateDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CopyTemplateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    if (!householdId) throw new Error("No household");
    const { data: source, error } = await context.supabase
      .from("schedule_template_slots")
      .select("*")
      .eq("member_id", data.member_id)
      .eq("day_of_week", data.from_day);
    if (error) throw error;
    if (!source || source.length === 0) return { inserted: 0 };
    const rows: any[] = [];
    for (const day of data.to_days) {
      for (const s of source) {
        rows.push({
          member_id: data.member_id,
          household_id: householdId,
          day_of_week: day,
          start_time: s.start_time,
          end_time: s.end_time,
          slot_kind: s.slot_kind,
          label: s.label,
          notes: s.notes,
        });
      }
    }
    const { error: insErr } = await context.supabase.from("schedule_template_slots").insert(rows);
    if (insErr) throw insErr;
    return { inserted: rows.length };
  });

const ApplyTemplateRangeInput = z.object({
  member_id: z.string().uuid(),
  from_day: z.number().int().min(0).max(6),
  start_date: z.string(),
  end_date: z.string(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  replace_existing: z.boolean().default(true),
});

export const applyTemplateDayToRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ApplyTemplateRangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: householdId } = await context.supabase.rpc("current_household");
    if (!householdId) throw new Error("No household");
    if (data.end_date < data.start_date) throw new Error("La fecha final no puede ser anterior a la inicial");

    const dates = datesInRange(data.start_date, data.end_date).filter((date) =>
      data.weekdays.includes(dayOfWeek(date)),
    );
    if (dates.length === 0) return { inserted: 0, dates: 0 };
    if (dates.length > 370) throw new Error("El rango es demasiado largo");

    const { data: source, error } = await context.supabase
      .from("schedule_template_slots")
      .select("*")
      .eq("member_id", data.member_id)
      .eq("day_of_week", data.from_day);
    if (error) throw error;
    if (!source || source.length === 0) return { inserted: 0, dates: dates.length };

    if (data.replace_existing) {
      const { error: delErr } = await context.supabase
        .from("schedule_day_slots")
        .delete()
        .eq("member_id", data.member_id)
        .in("date", dates);
      if (delErr) throw delErr;
    }

    const rows: any[] = [];
    for (const date of dates) {
      for (const s of source) {
        rows.push({
          member_id: data.member_id,
          household_id: householdId,
          date,
          start_time: s.start_time,
          end_time: s.end_time,
          slot_kind: s.slot_kind,
          label: s.label,
          notes: s.notes,
        });
      }
    }

    const { error: insErr } = await context.supabase.from("schedule_day_slots").insert(rows);
    if (insErr) throw insErr;
    return { inserted: rows.length, dates: dates.length };
  });

function datesInRange(from: string, to: string) {
  const out: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    out.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function dayOfWeek(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return (d.getDay() + 6) % 7;
}

function formatDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
