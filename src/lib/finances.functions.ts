import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    return category;
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("expense_categories").delete().eq("id", data.id);
    if (error) throw error;
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
      return updated;
    }
    const { data: inserted, error } = await context.supabase
      .from("salaries")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
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
    return { ok: true };
  });
