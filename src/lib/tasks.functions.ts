import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TaskInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  category: z.string().optional(),
  due_date: z.string().datetime().optional(),
  recurrence: z.string().optional(),
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

    const { data: task, error } = await context.supabase
      .from("tasks")
      .insert({ ...data, household_id: householdId, created_by: context.userId })
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
