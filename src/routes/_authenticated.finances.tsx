import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Plus, Wallet, TrendingUp, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { listFinances, createExpense, createCategory, createBudget, createSalary } from "@/lib/finances.functions";
import { toast } from "sonner";

const financesQueryOptions = queryOptions({
  queryKey: ["finances"],
  queryFn: () => listFinances(),
});

export const Route = createFileRoute("/_authenticated/finances")({
  loader: ({ context }) => context.queryClient.ensureQueryData(financesQueryOptions),
  head: () => ({
    meta: [{ title: "Finanzas - HomeSync" }],
  }),
  component: FinancesPage,
});

function FinancesPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(financesQueryOptions);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["finances"] });

  const totalExpenses = data.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalBudget = data.budgets.reduce((sum, b) => sum + Number(b.amount), 0);

  const expensesByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of data.expenses) {
      const catId = expense.category_id || "uncategorized";
      map.set(catId, (map.get(catId) || 0) + Number(expense.amount));
    }
    return Array.from(map.entries()).map(([id, amount]) => ({
      id,
      name: data.categories.find((c) => c.id === id)?.name || "Sin categoría",
      amount,
    }));
  }, [data.expenses, data.categories]);

  const salaryTotal = data.salaries.reduce((sum, s) => sum + Number(s.amount), 0);
  const memberContributions = data.members.map((member) => {
    const salary = data.salaries.find((s) => s.member_id === member.id)?.amount || 0;
    const share = salaryTotal > 0 ? (Number(salary) / salaryTotal) * totalExpenses : 0;
    return { member, salary, share };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Finanzas</h2>
          <p className="text-muted-foreground">Gastos, presupuestos y aportaciones</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBudgetOpen(true)}>
            Presupuesto
          </Button>
          <Button onClick={() => setExpenseOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Gasto
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Gastos mes" value={`€${totalExpenses.toFixed(2)}`} icon={Wallet} />
        <SummaryCard title="Presupuesto" value={`€${totalBudget.toFixed(2)}`} icon={TrendingUp} />
        <SummaryCard title="Restante" value={`€${Math.max(0, totalBudget - totalExpenses).toFixed(2)}`} icon={Wallet} />
        <SummaryCard title="Miembros" value={data.members.length} icon={Users} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {expensesByCategory.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay gastos registrados.</p>
            )}
            {expensesByCategory.map((cat) => (
              <div key={cat.id} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{cat.name}</span>
                  <span className="font-medium">€{cat.amount.toFixed(2)}</span>
                </div>
                <Progress value={totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Aportaciones proporcionales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {memberContributions.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay miembros con salario registrado.</p>
            )}
            {memberContributions.map(({ member, salary, share }) => (
              <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">{member.display_name}</p>
                  <p className="text-xs text-muted-foreground">Salario: €{Number(salary).toFixed(2)}</p>
                </div>
                <Badge variant="secondary">€{share.toFixed(2)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos gastos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.expenses.slice(0, 10).map((expense) => (
            <div key={expense.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">{expense.description || "Gasto"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(expense.date).toLocaleDateString("es-ES")} ·{" "}
                  {data.categories.find((c) => c.id === expense.category_id)?.name || "Sin categoría"}
                </p>
              </div>
              <span className="font-bold text-destructive">-€{Number(expense.amount).toFixed(2)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <AddExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} data={data} onAdded={refresh} />
      <AddBudgetDialog open={budgetOpen} onOpenChange={setBudgetOpen} data={data} onAdded={refresh} />
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon }: { title: string; value: string | number; icon: any }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AddExpenseDialog({ open, onOpenChange, data, onAdded }: any) {
  const doCreate = useServerFn(createExpense);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    setSubmitting(true);
    try {
      await doCreate({
        data: {
          amount: Number(amount),
          description: description || undefined,
          category_id: categoryId || undefined,
        },
      });
      toast.success("Gasto añadido");
      setAmount("");
      setDescription("");
      onAdded();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir gasto");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo gasto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cantidad (€)</Label>
              <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="">Sin categoría</option>
                {data.categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting || !amount} className="w-full">
              {submitting ? "Añadiendo..." : "Añadir gasto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddBudgetDialog({ open, onOpenChange, data, onAdded }: any) {
  const doCreateBudget = useServerFn(createBudget);
  const doCreateCategory = useServerFn(createCategory);
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    setSubmitting(true);
    try {
      let finalCategoryId = categoryId;
      if (!finalCategoryId && newCategory.trim()) {
        const cat = await doCreateCategory({ data: { name: newCategory.trim() } });
        finalCategoryId = cat.id;
      }
      await doCreateBudget({
        data: {
          amount: Number(amount),
          category_id: finalCategoryId || undefined,
        },
      });
      toast.success("Presupuesto añadido");
      setAmount("");
      setNewCategory("");
      onAdded();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir presupuesto");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo presupuesto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Cantidad (€)</Label>
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Categoría existente</Label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2"
            >
              <option value="">General</option>
              {data.categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>O nueva categoría</Label>
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Ej. Supermercado" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting || !amount} className="w-full">
              {submitting ? "Añadiendo..." : "Añadir presupuesto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
