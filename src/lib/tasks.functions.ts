import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ChecklistItem = z.object({
  text: z.string().min(1).max(200),
  done: z.boolean().default(false),
});

const TaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional().nullable(),
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
    if (data.assign_random) {
      let q = context.supabase
        .from("household_members")
        .select("id, is_child")
        .eq("household_id", householdId);
      if (!data.child_allowed) q = q.eq("is_child", false);
      const { data: members } = await q;
      if (members && members.length > 0) {
        assigned_to = members[Math.floor(Math.random() * members.length)].id;
      }
    }

    const { assign_random: _ar, ...rest } = data;
    const { data: task, error } = await context.supabase
      .from("tasks")
      .insert({
        ...rest,
        assigned_to,
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
    const { data: task, error } = await context.supabase
      .from("tasks")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // If completing a recurring task, spawn the next occurrence.
    if (rest.status === "done" && task && (task as any).recurrence_days) {
      const days = (task as any).recurrence_days as number;
      const base = (task as any).due_date ? new Date((task as any).due_date) : new Date();
      const nextDue = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
      await context.supabase.from("tasks").insert({
        household_id: (task as any).household_id,
        created_by: context.userId,
        title: (task as any).title,
        description: (task as any).description,
        assigned_to: (task as any).assigned_to,
        priority: (task as any).priority,
        category: (task as any).category,
        due_date: nextDue.toISOString(),
        recurrence_days: days,
        child_allowed: (task as any).child_allowed,
        checklist: (task as any).checklist,
        photo_path: (task as any).photo_path,
        status: "pending",
      });
    }

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
