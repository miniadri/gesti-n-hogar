import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logHouseholdActivity } from "./activity.functions";

const ExpenseInput = z.object({
  amount: z.number().positive(),
  description: z.string().optional(),
  category_id: z.string().uuid().optional(),
  paid_by: z.string().uuid().optional(),
  date: z.string().date().default(() => new Date().toISOString().split("T")[0]),
  is_subscription: z.boolean().default(false),
  recurrence: z.string().optional(),
  receipt_id: z.string().uuid().optional(),
});

const CategoryInput = z.object({
  name: z.string().min(1).max(100),
  color: z.string().optional(),
  icon: z.string().optional(),
});

const BudgetInput = z.object({
  category_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  period: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
});

const ContributionInput = z.object({
  amount: z.number().nonnegative().nullable().optional(),
  contribution_type: z.enum(["percentage", "fixed"]),
  contribution_value: z.number().nonnegative(),
  currency: z.string().default("EUR"),
});

const ThresholdInput = z.object({
  critical_threshold_percent: z.number().int().min(1).max(100),
});

async function currentHouseholdId(supabase: any) {
  const { data } = await supabase.rpc("current_household");
  if (!data) throw new Error("No household");
  return data as string;
}

async function currentMemberId(supabase: any, userId: string, householdId: string) {
  const { data } = await supabase
    .from("household_members")
    .select("id")
    .eq("household_id", householdId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.id as string | undefined;
}

export const listFinances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const householdId = await currentHouseholdId(context.supabase);

    const [
      { data: expenses },
      { data: categories },
      { data: budgets },
      { data: members },
      { data: household },
      { data: contributions },
    ] = await Promise.all([
      context.supabase
        .from("expenses")
        .select("*")
        .eq("household_id", householdId)
        .order("date", { ascending: false })
        .limit(100),
      context.supabase.from("expense_categories").select("*").eq("household_id", householdId).order("name"),
      context.supabase.from("budgets").select("*").eq("household_id", householdId),
      context.supabase.from("household_members").select("*").eq("household_id", householdId),
      context.supabase.from("households").select("id, name, critical_threshold_percent").eq("id", householdId).single(),
      context.supabase.rpc("get_household_contributions", { _household_id: householdId }),
    ]);

    const memberId = await currentMemberId(context.supabase, context.userId, householdId);
    let mySalary: any = null;
    if (memberId) {
      const { data } = await context.supabase
        .from("salaries")
        .select("*")
        .eq("member_id", memberId)
        .maybeSingle();
      mySalary = data;
    }

    return {
      expenses: expenses ?? [],
      categories: categories ?? [],
      budgets: budgets ?? [],
      members: members ?? [],
      household: household ?? { id: householdId, name: "Mi hogar", critical_threshold_percent: 85 },
      contributions: (contributions ?? []) as Array<{
        member_id: string;
        display_name: string;
        is_child: boolean;
        contribution_type: string;
        contribution_value: number;
        contribution_amount: number;
        has_income: boolean;
      }>,
      myMemberId: memberId ?? null,
      mySalary,
      isAdmin: Boolean(isAdmin),
    };
  });

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ExpenseInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await currentHouseholdId(context.supabase);
    const { data: expense, error } = await context.supabase
      .from("expenses")
      .insert({ ...data, household_id: householdId, created_by: context.userId })
      .select()
      .single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "finance",
      action: data.receipt_id ? "imported" : "created",
      title: `${expense.description || "Gasto"} añadido`,
      details: `Importe: €${Number(expense.amount).toFixed(2)}`,
      entityType: "expense",
      entityId: expense.id,
      status: "ok",
      metadata: {
        amount: expense.amount,
        category_id: expense.category_id,
        paid_by: expense.paid_by,
        date: expense.date,
        is_subscription: expense.is_subscription,
        recurrence: expense.recurrence,
        receipt_id: expense.receipt_id,
      },
    });
    return expense;
  });

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CategoryInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await currentHouseholdId(context.supabase);
    const { data: category, error } = await context.supabase
      .from("expense_categories")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "finance",
      action: "created",
      title: `Categoría de gasto "${category.name}" creada`,
      entityType: "expense_category",
      entityId: category.id,
      status: "ok",
      metadata: { color: category.color, icon: category.icon },
    });
    return category;
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await currentHouseholdId(context.supabase);
    const { data: category } = await context.supabase
      .from("expense_categories")
      .select("id, name")
      .eq("household_id", householdId)
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("expense_categories").delete().eq("id", data.id);
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "finance",
      action: "deleted",
      title: `Categoría de gasto "${category?.name ?? "Sin nombre"}" eliminada`,
      entityType: "expense_category",
      entityId: data.id,
      status: "warning",
    });
    return { ok: true };
  });

export const createBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BudgetInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await currentHouseholdId(context.supabase);
    const { data: budget, error } = await context.supabase
      .from("budgets")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "finance",
      action: "created",
      title: "Presupuesto añadido",
      details: `Importe: €${Number(budget.amount).toFixed(2)}`,
      entityType: "budget",
      entityId: budget.id,
      status: "ok",
      metadata: {
        amount: budget.amount,
        category_id: budget.category_id,
        period: budget.period,
      },
    });
    return budget;
  });

export const upsertMyContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ContributionInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await currentHouseholdId(context.supabase);
    const memberId = await currentMemberId(context.supabase, context.userId, householdId);
    if (!memberId) throw new Error("No eres miembro de este hogar");

    const { data: existing } = await context.supabase
      .from("salaries")
      .select("id")
      .eq("member_id", memberId)
      .maybeSingle();

    const payload = {
      member_id: memberId,
      household_id: householdId,
      amount: data.amount ?? null,
      currency: data.currency,
      contribution_type: data.contribution_type,
      contribution_value: data.contribution_value,
    };

    if (existing) {
      const { data: updated, error } = await context.supabase
        .from("salaries")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      await logContributionActivity(context.supabase, householdId, context.userId, updated, false);
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("salaries")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    await logContributionActivity(context.supabase, householdId, context.userId, inserted, true);
    return inserted;
  });

export const updateCriticalThreshold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ThresholdInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = await currentHouseholdId(context.supabase);
    const { error } = await context.supabase
      .from("households")
      .update({ critical_threshold_percent: data.critical_threshold_percent })
      .eq("id", householdId);
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "finance",
      action: "updated",
      title: "Umbral financiero actualizado",
      details: `Nuevo umbral: ${data.critical_threshold_percent}%`,
      entityType: "household",
      entityId: householdId,
      status: "ok",
      metadata: { critical_threshold_percent: data.critical_threshold_percent },
    });
    return { ok: true };
  });

export const deleteExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo el administrador del hogar puede borrar gastos");
    const householdId = await currentHouseholdId(context.supabase);
    const { data: expense } = await context.supabase
      .from("expenses")
      .select("id, amount, description, category_id, date, receipt_id")
      .eq("household_id", householdId)
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await context.supabase.from("expenses").delete().eq("id", data.id);
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "finance",
      action: "deleted",
      title: `${expense?.description || "Gasto"} eliminado`,
      details: expense ? `Importe: €${Number(expense.amount).toFixed(2)}` : null,
      entityType: "expense",
      entityId: data.id,
      status: "warning",
      metadata: expense ?? {},
    });
    return { ok: true };
  });

export const restoreExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ row: z.record(z.string(), z.any()) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo el administrador puede restaurar gastos");
    const householdId = await currentHouseholdId(context.supabase);
    const payload: Record<string, any> = { ...data.row, household_id: householdId };
    delete payload.updated_at;
    const { data: row, error } = await context.supabase
      .from("expenses")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    await logHouseholdActivity(context.supabase, householdId, context.userId, {
      domain: "finance",
      action: "restored",
      title: `${row.description || "Gasto"} restaurado`,
      details: `Importe: €${Number(row.amount).toFixed(2)}`,
      entityType: "expense",
      entityId: row.id,
      status: "ok",
      metadata: { restored_from_undo: true },
    });
    return row;
  });

async function logContributionActivity(
  supabase: any,
  householdId: string,
  userId: string,
  salary: any,
  created: boolean,
) {
  const contributionAmount = salary?.contribution_type === "percentage" && salary?.amount != null
    ? (Number(salary.amount) * Number(salary.contribution_value ?? 0)) / 100
    : Number(salary?.contribution_value ?? 0);

  await logHouseholdActivity(supabase, householdId, userId, {
    domain: "finance",
    action: created ? "created" : "updated",
    title: created ? "Aporte configurado" : "Aporte actualizado",
    details: `Aporte visible: €${Number(contributionAmount || 0).toFixed(2)}`,
    entityType: "salary",
    entityId: salary.id,
    status: "ok",
    metadata: {
      contribution_type: salary.contribution_type,
      contribution_value: salary.contribution_value,
      contribution_amount: contributionAmount,
      currency: salary.currency,
    },
  });
}
