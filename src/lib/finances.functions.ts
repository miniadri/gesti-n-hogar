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

const SalaryInput = z.object({
  member_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default("EUR"),
});

export const listFinances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const [{ data: expenses }, { data: categories }, { data: budgets }, { data: salaries }, { data: members }] =
      await Promise.all([
        context.supabase
          .from("expenses")
          .select("*")
          .eq("household_id", householdId)
          .order("date", { ascending: false })
          .limit(50),
        context.supabase.from("expense_categories").select("*").eq("household_id", householdId),
        context.supabase.from("budgets").select("*").eq("household_id", householdId),
        context.supabase.from("salaries").select("*").eq("household_id", householdId),
        context.supabase.from("household_members").select("*").eq("household_id", householdId),
      ]);

    return {
      expenses: expenses ?? [],
      categories: categories ?? [],
      budgets: budgets ?? [],
      salaries: salaries ?? [],
      members: members ?? [],
    };
  });

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ExpenseInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

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
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: category, error } = await context.supabase
      .from("expense_categories")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return category;
  });

export const createBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BudgetInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: budget, error } = await context.supabase
      .from("budgets")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return budget;
  });

export const createSalary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SalaryInput.parse(input))
  .handler(async ({ data, context }) => {
    const householdId = (await context.supabase.rpc("current_household")).data;
    if (!householdId) throw new Error("No household");

    const { data: salary, error } = await context.supabase
      .from("salaries")
      .insert({ ...data, household_id: householdId })
      .select()
      .single();
    if (error) throw error;
    return salary;
  });
