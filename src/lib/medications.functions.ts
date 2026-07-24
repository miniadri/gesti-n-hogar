import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import webPush from "web-push";

const MedicationFormEnum = z.enum(["pill", "ml", "drops", "inhaler", "patch", "injection", "other"]);
const IntakeStatusEnum = z.enum(["pending", "taken", "skipped", "missed"]);

const ScheduleInput = z.object({
  id: z.string().uuid().optional(),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/),
  days_of_week: z.array(z.number().int().min(0).max(6)),
  frequency_type: z.enum(["daily", "interval"]),
  interval_hours: z.number().int().min(1).optional(),
  active: z.boolean().default(true),
});

const CreateMedicationInput = z.object({
  member_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  form: MedicationFormEnum,
  dose_amount: z.number().positive(),
  unit: z.string().min(1).max(50),
  total_quantity: z.number().nonnegative().optional(),
  current_quantity: z.number().nonnegative().optional(),
  low_stock_threshold: z.number().nonnegative().optional(),
  reminders_enabled: z.boolean().default(true),
  notes: z.string().max(1000).optional(),
  timezone: z.string().min(1).max(64).default("UTC"),
  schedules: z.array(ScheduleInput).min(1),
});

const UpdateMedicationInput = z.object({
  id: z.string().uuid(),
  member_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  form: MedicationFormEnum,
  dose_amount: z.number().positive(),
  unit: z.string().min(1).max(50),
  total_quantity: z.number().nonnegative().optional(),
  current_quantity: z.number().nonnegative().optional(),
  low_stock_threshold: z.number().nonnegative().optional(),
  reminders_enabled: z.boolean().default(true),
  notes: z.string().max(1000).optional(),
  timezone: z.string().min(1).max(64).default("UTC"),
  schedules: z.array(ScheduleInput).min(1),
});


const RecordIntakeInput = z.object({
  intake_id: z.string().uuid(),
  status: IntakeStatusEnum,
  taken_at: z.string().datetime().optional(),
});

function getWeekday(date: Date) {
  return date.getDay();
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toISODate(date: Date) {
  return date.toISOString().split("T")[0];
}

function parseTime(time: string, base: Date) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

export async function generateUpcomingIntakes(
  supabase: any,
  medicationId: string,
  householdId: string,
  daysAhead = 7,
) {
  const now = new Date();
  const until = addDays(now, daysAhead);
  until.setHours(23, 59, 59, 999);

  const { data: med, error } = await supabase
    .from("medications")
    .select("*, medication_schedules(*)")
    .eq("id", medicationId)
    .eq("household_id", householdId)
    .single();
  if (error || !med) throw error || new Error("Medication not found");

  const existing = await supabase
    .from("medication_intakes")
    .select("id, scheduled_for, schedule_id")
    .eq("medication_id", medicationId)
    .gte("scheduled_for", now.toISOString())
    .lte("scheduled_for", until.toISOString());

  const existingKeys = new Set(
    (existing.data ?? []).map((r: any) => `${r.schedule_id || "none"}_${new Date(r.scheduled_for).toISOString()}`),
  );

  const inserts: any[] = [];

  for (const schedule of med.medication_schedules ?? []) {
    if (!schedule.active) continue;
    const daysSet = new Set(schedule.days_of_week ?? [0, 1, 2, 3, 4, 5, 6]);

    if (schedule.frequency_type === "interval" && schedule.interval_hours) {
      let cursor = parseTime(schedule.time_of_day, now);
      while (cursor <= until) {
        if (daysSet.has(getWeekday(cursor))) {
          const iso = cursor.toISOString();
          const key = `${schedule.id}_${iso}`;
          if (!existingKeys.has(key)) {
            inserts.push({
              medication_id: medicationId,
              schedule_id: schedule.id,
              scheduled_for: iso,
              status: "pending",
            });
          }
        }
        cursor = new Date(cursor.getTime() + schedule.interval_hours * 60 * 60 * 1000);
      }
    } else {
      for (let d = new Date(now); d <= until; d = addDays(d, 1)) {
        if (!daysSet.has(getWeekday(d))) continue;
        const scheduled = parseTime(schedule.time_of_day, d);
        const iso = scheduled.toISOString();
        const key = `${schedule.id}_${iso}`;
        if (!existingKeys.has(key)) {
          inserts.push({
            medication_id: medicationId,
            schedule_id: schedule.id,
            scheduled_for: iso,
            status: "pending",
          });
        }
      }
    }
  }

  if (inserts.length) {
    const { error: insertError } = await supabase.from("medication_intakes").insert(inserts);
    if (insertError) throw insertError;
  }
  return { generated: inserts.length };
}

export const listMedications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await context.supabase.rpc("current_household");
    if (!householdId.data) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("medications")
      .select("*, medication_schedules(*), medication_intakes(*)")
      .eq("household_id", householdId.data)
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const createMedication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateMedicationInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await context.supabase.rpc("current_household");
    if (!householdId.data) throw new Error("No household");

    const { schedules, ...medPayload } = data;

    const { data: med, error } = await context.supabase
      .from("medications")
      .insert({
        ...medPayload,
        household_id: householdId.data,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error || !med) throw error || new Error("Failed to create medication");

    const scheduleRows = schedules.map((s) => ({
      medication_id: med.id,
      time_of_day: s.time_of_day,
      days_of_week: s.days_of_week,
      frequency_type: s.frequency_type,
      interval_hours: s.interval_hours ?? null,
      active: s.active,
    }));

    const { error: schedError } = await context.supabase.from("medication_schedules").insert(scheduleRows);
    if (schedError) throw schedError;

    await generateUpcomingIntakes(context.supabase, med.id, householdId.data);

    return med;
  });

export const updateMedication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateMedicationInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await context.supabase.rpc("current_household");
    if (!householdId.data) throw new Error("No household");

    const { id, schedules, ...medPayload } = data;

    const { error } = await context.supabase
      .from("medications")
      .update(medPayload)
      .eq("id", id)
      .eq("household_id", householdId.data);
    if (error) throw error;

    const keptIds = schedules.map((s) => s.id).filter(Boolean) as string[];
    await context.supabase.from("medication_schedules").delete().eq("medication_id", id).not("id", "in", `(${keptIds.join(",")})`);

    for (const s of schedules) {
      const row = {
        medication_id: id,
        time_of_day: s.time_of_day,
        days_of_week: s.days_of_week,
        frequency_type: s.frequency_type,
        interval_hours: s.interval_hours ?? null,
        active: s.active,
      };
      if (s.id) {
        await context.supabase.from("medication_schedules").update(row).eq("id", s.id);
      } else {
        await context.supabase.from("medication_schedules").insert(row);
      }
    }

    await generateUpcomingIntakes(context.supabase, id, householdId.data);
    return { ok: true };
  });

export const deleteMedication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await context.supabase.rpc("current_household");
    if (!householdId.data) throw new Error("No household");

    const { error } = await context.supabase
      .from("medications")
      .delete()
      .eq("id", data.id)
      .eq("household_id", householdId.data);
    if (error) throw error;
    return { ok: true };
  });

export const recordIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RecordIntakeInput.parse(input))
  .handler(async ({ data, context }) => {
    const takenAt = data.taken_at ? new Date(data.taken_at).toISOString() : new Date().toISOString();

    const { data: intake, error: fetchError } = await context.supabase
      .from("medication_intakes")
      .select("*, medications(*)")
      .eq("id", data.intake_id)
      .single();
    if (fetchError || !intake) throw fetchError || new Error("Intake not found");

    const { error } = await context.supabase
      .from("medication_intakes")
      .update({
        status: data.status,
        taken_at: takenAt,
        confirmed_by: context.userId,
      })
      .eq("id", data.intake_id);
    if (error) throw error;

    if (data.status === "taken" && intake.medications?.dose_amount) {
      const newQty = Math.max(0, (intake.medications.current_quantity ?? 0) - intake.medications.dose_amount);
      await context.supabase
        .from("medications")
        .update({ current_quantity: newQty })
        .eq("id", intake.medication_id);
    }

    return { ok: true };
  });

export const getMedicationIntakes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        medicationId: z.string().uuid(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const householdId = await context.supabase.rpc("current_household");
    if (!householdId.data) throw new Error("No household");

    const now = new Date();
    const from = data.from ? new Date(data.from).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = data.to ? new Date(data.to).toISOString() : new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

    const { data: intakes, error } = await context.supabase
      .from("medication_intakes")
      .select("*, medications(name, unit, dose_amount, household_id)")
      .eq("medications.household_id", householdId.data)
      .eq("medication_id", data.medicationId)
      .gte("scheduled_for", from)
      .lte("scheduled_for", to)
      .order("scheduled_for", { ascending: false });
    if (error) throw error;
    return intakes ?? [];
  });

export const getDueIntakes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = await context.supabase.rpc("current_household");
    if (!householdId.data) throw new Error("No household");

    const now = new Date().toISOString();
    const window = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { data, error } = await context.supabase
      .from("medication_intakes")
      .select("*, medications(*, household_members(display_name))")
      .eq("medications.household_id", householdId.data)
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const getTelegramProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("telegram_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data ?? null;
  });

export const unlinkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase.from("telegram_profiles").delete().eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

export const linkTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: pending, error: findError } = await context.supabase
      .from("telegram_pending_links")
      .select("chat_id")
      .eq("token", data.token)
      .single();
    if (findError || !pending) throw new Error("Enlace inválido o caducado");

    const { error: upsertError } = await context.supabase
      .from("telegram_profiles")
      .upsert({ user_id: context.userId, chat_id: pending.chat_id }, { onConflict: "user_id" });
    if (upsertError) throw upsertError;

    await context.supabase.from("telegram_pending_links").delete().eq("token", data.token);
    return { ok: true, chat_id: pending.chat_id };
  });

export const sendMedicationReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ intakeIds: z.array(z.string().uuid()) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: intakes, error } = await context.supabase
      .from("medication_intakes")
      .select("*, medications(*, household_members(display_name, household_id))")
      .in("id", data.intakeIds);
    if (error) throw error;

    const results = [];
    for (const intake of intakes ?? []) {
      results.push(await notifyIntake(context.supabase, intake));
    }
    return { sent: results.length };
  });

async function notifyIntake(supabase: any, intake: any) {
  const med = intake.medications;
  const memberName = med?.household_members?.display_name || "familiar";
  const title = `💊 Toca medicación: ${med?.name}`;
  const body = `${memberName} debe tomar ${med?.dose_amount} ${med?.unit} de ${med?.name}.`;

  const householdId = med?.household_members?.household_id;

  const { data: members } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId);

  const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean);

  await sendPushToUsers(supabase, userIds, title, body, "/medications");

  const { data: profiles } = await supabase
    .from("telegram_profiles")
    .select("chat_id")
    .in("user_id", userIds);

  for (const profile of profiles ?? []) {
    if (profile.chat_id) {
      await sendTelegramMessage(profile.chat_id, `${title}\n${body}\n\nAbre HomeSync para confirmar.`);
    }
  }

  await supabase
    .from("medication_intakes")
    .update({
      reminder_count: (intake.reminder_count ?? 0) + 1,
      last_reminder_sent_at: new Date().toISOString(),
    })
    .eq("id", intake.id);

  return { ok: true };
}

async function sendPushToUsers(supabase: any, userIds: string[], title: string, body: string, url: string) {
  webPush.setVapidDetails(
    "mailto:admin@homesync.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const { data: subs } = await supabase.from("push_subscriptions").select("*").in("user_id", userIds);
  for (const sub of subs ?? []) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url }),
      );
    } catch (err) {
      console.error("Push failed", err);
    }
  }
}

async function sendTelegramMessage(chatId: string, text: string) {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const TELEGRAM_API_KEY = process.env.TELEGRAM_API_KEY;
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
    console.warn("Telegram not configured");
    return;
  }

  try {
    const res = await fetch("https://connector-gateway.lovable.dev/telegram/sendMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TELEGRAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
    if (!res.ok) {
      console.error("Telegram send failed", await res.text());
    }
  } catch (err) {
    console.error("Telegram send error", err);
  }
}
