import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeTaskMembers } from "./family-features";

const ChecklistItem = z.object({
  text: z.string().min(1).max(200),
  done: z.boolean().default(false),
});

const TaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  assigned_member_ids: z.array(z.string().uuid()).max(100).optional(),
  completion_mode: z.enum(["any", "all"]).default("any"),
  assign_random: z.boolean().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  category: z.string().optional(),
  due_date: z.string().datetime().optional(),
  recurrence_days: z.number().int().positive().max(365).optional().nullable(),
  child_allowed: z.boolean().optional().default(false),
  checklist: z.array(ChecklistItem).optional().nullable(),
  photo_path: z.string().optional().nullable(),
});

const UpdateTaskInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "done", "cancelled"]).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional().nullable(),
  assigned_member_ids: z.array(z.string().uuid()).max(100).optional(),
  completion_mode: z.enum(["any", "all"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  category: z.string().optional(),
  due_date: z.string().datetime().optional().nullable(),
  recurrence_days: z.number().int().positive().max(365).optional().nullable(),
  child_allowed: z.boolean().optional(),
  checklist: z.array(ChecklistItem).optional().nullable(),
  photo_path: z.string().optional().nullable(),
});

const DeleteTaskInput = z.object({
  id: z.string().uuid(),
});

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data, error } = await context.supabase
      .from("tasks")
      .select("*, assignee:assigned_to(*)")
      .eq("household_id", householdId)
      .order("due_date", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    let assigned_to = data.assigned_to ?? null;
    const { data: eligible, error: eligibleError } = await context.supabase
      .from("household_members")
      .select("id, is_child, display_name")
      .eq("household_id", householdId)
      .neq("display_name", "Kiosko cocina");
    if (eligibleError) throw eligibleError;
    const eligibleIds = (eligible ?? [])
      .filter((member) => data.child_allowed || !member.is_child)
      .map((member) => member.id);
    if (data.assign_random) {
      if (!eligibleIds.length) throw new Error("No hay responsables disponibles");
      assigned_to = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
    }
    const assignedIds = normalizeTaskMembers(
      data.assign_random
        ? [assigned_to!]
        : (data.assigned_member_ids ?? (assigned_to ? [assigned_to] : [])),
      eligibleIds,
    );
    if (data.completion_mode === "all" && !assignedIds.length)
      throw new Error("Selecciona responsables");

    const { assign_random: _ar, ...rest } = data;
    const { data: task, error } = await context.supabase
      .from("tasks")
      .insert({
        ...rest,
        assigned_to: assignedIds.length === 1 ? assignedIds[0] : null,
        assigned_member_ids: assignedIds,
        household_id: householdId,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return task;
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    if (rest.status === "done") {
      if (Object.keys(rest).length !== 1)
        throw new Error("Completa la tarea por separado de su edición");
      const { data: completed, error } = await (context.supabase as any).rpc(
        "complete_household_task",
        { _task_id: id },
      );
      if (error) throw error;
      return completed;
    }
    const { data: task, error } = await context.supabase
      .from("tasks")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return task;
  });

export const completeTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), member_id: z.string().uuid().optional() })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: task, error } = await (context.supabase as any).rpc("complete_household_task", {
      _task_id: data.id,
      _member_id: data.member_id ?? null,
    });
    if (error) throw new Error(error.message);
    return task;
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DeleteTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const SignedUrlInput = z.object({ path: z.string().min(1) });

export const getTaskPhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SignedUrlInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("task-photos")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw error;
    return signed;
  });

const RestoreTaskInput = z.object({ row: z.record(z.string(), z.any()) });

export const restoreTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RestoreTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");
    const payload: Record<string, any> = { ...data.row, household_id: householdId };
    delete payload.assignee;
    delete payload.updated_at;
    const { data: row, error } = await context.supabase
      .from("tasks")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

const VoiceTaskInput = z.object({
  title: z.string().min(1).max(200),
  kiosk_member_id: z.string().uuid().optional(),
});

export const createKioskTaskByTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => VoiceTaskInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    let assignedTo: string | null = null;
    if (data.kiosk_member_id) {
      const { data: member } = await context.supabase
        .from("household_members")
        .select("id")
        .eq("id", data.kiosk_member_id)
        .eq("household_id", householdId)
        .maybeSingle();
      assignedTo = member?.id ?? null;
    }

    const { data: task, error } = await context.supabase
      .from("tasks")
      .insert({
        household_id: householdId,
        title: data.title,
        assigned_to: assignedTo,
        priority: "medium",
        status: "pending",
        category: "Kiosko",
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw error;
    return task;
  });
