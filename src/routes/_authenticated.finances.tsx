import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState, useMemo, useRef } from "react";
import { Plus, Wallet, TrendingUp, Users, AlertTriangle, Eye, EyeOff, Trash2, Settings2, Repeat, Camera, Upload, Loader2, FileDown, FileText } from "lucide-react";
import { exportExpensesCSV, exportFinancesPDF } from "@/lib/finances-export";

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
import {
  listFinances,
  createExpense,
  createCategory,
  deleteCategory,
  createBudget,
  upsertMyContribution,
  updateCriticalThreshold,
  deleteExpense,
  restoreExpense,
} from "@/lib/finances.functions";
import { listHouseholdActivity } from "@/lib/activity.functions";
import { scanTicket } from "@/lib/ocr.functions";
import { supabase } from "@/integrations/supabase/client";
import { ActivityList } from "@/components/ActivityList";
import { undoableToast } from "@/hooks/use-undoable";
import { toast } from "sonner";


const financesQueryOptions = queryOptions({
  queryKey: ["finances"],
  queryFn: () => listFinances(),
});

const financeActivityQueryOptions = queryOptions({
  queryKey: ["household-activity", "finance"],
  queryFn: () => listHouseholdActivity({ data: { domain: "finance", limit: 8 } }),
});

export const Route = createFileRoute("/_authenticated/finances")({
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(financesQueryOptions),
    context.queryClient.ensureQueryData(financeActivityQueryOptions),
  ]),
  head: () => ({
    meta: [{ title: "Finanzas - HomeSync" }],
  }),
  component: FinancesPage,
});

function FinancesPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(financesQueryOptions);
  const { data: activity } = useSuspenseQuery(financeActivityQueryOptions);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [contribOpen, setContribOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [thresholdOpen, setThresholdOpen] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["finances"] });
    queryClient.invalidateQueries({ queryKey: ["household-activity", "finance"] });
  };
  const doDeleteExpense = useServerFn(deleteExpense);
  const doRestoreExpense = useServerFn(restoreExpense);

  const totalExpenses = data.expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalBudget = data.budgets.reduce((sum, b) => sum + Number(b.amount), 0);
  const totalContributions = data.contributions.reduce(
    (sum, c) => sum + Number(c.contribution_amount || 0),
    0,
  );
  const availableAfterExpenses = totalContributions - totalExpenses;
  const spentPercent = totalContributions > 0 ? (totalExpenses / totalContributions) * 100 : 0;
  const threshold = data.household.critical_threshold_percent;
  const isCritical = spentPercent >= threshold;

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Finanzas</h2>
          <p className="text-muted-foreground">Aportes del hogar, gastos y presupuesto</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => exportExpensesCSV(data.expenses as any, data.categories as any)}
            disabled={data.expenses.length === 0}
          >
            <FileDown className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              exportFinancesPDF({
                expenses: data.expenses as any,
                categories: data.categories as any,
                contributions: data.contributions as any,
                householdName: data.household.name,
                totals: { expenses: totalExpenses, contributions: totalContributions, budget: totalBudget },
              })
            }
            disabled={data.expenses.length === 0}
          >
            <FileText className="mr-2 h-4 w-4" /> PDF
          </Button>
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            <Settings2 className="mr-2 h-4 w-4" /> Categorías
          </Button>
          <Button variant="outline" onClick={() => setThresholdOpen(true)}>
            Umbral {threshold}%
          </Button>
          <Button variant="outline" onClick={() => setContribOpen(true)}>
            Mi aporte
          </Button>
          <Button variant="outline" onClick={() => setBudgetOpen(true)}>
            Presupuesto
          </Button>
          <Button onClick={() => setExpenseOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Gasto
          </Button>
        </div>
      </div>

      {isCritical && totalContributions > 0 && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-semibold text-destructive">Gasto crítico alcanzado</p>
              <p className="text-sm text-muted-foreground">
                Se ha gastado el {spentPercent.toFixed(1)}% de los aportes (umbral {threshold}%). Revisad
                cómo actuar antes de superarlo.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard title="Aportes totales" value={`€${totalContributions.toFixed(2)}`} icon={Users} />
        <SummaryCard title="Gastos mes" value={`€${totalExpenses.toFixed(2)}`} icon={Wallet} />
        <SummaryCard
          title="Disponible"
          value={`€${availableAfterExpenses.toFixed(2)}`}
          icon={TrendingUp}
        />
        <SummaryCard title="Presupuesto" value={`€${totalBudget.toFixed(2)}`} icon={Wallet} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consumo de aportes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Gastado</span>
            <span className="font-medium">
              €{totalExpenses.toFixed(2)} / €{totalContributions.toFixed(2)} ({spentPercent.toFixed(1)}%)
            </span>
          </div>
          <Progress value={Math.min(100, spentPercent)} />
          <p className="text-xs text-muted-foreground">
            Alerta configurada al {threshold}% del total de aportes.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Aportes por miembro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.contributions.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay adultos con aporte definido.</p>
            )}
            {data.contributions.map((c) => {
              const isMe = c.member_id === data.myMemberId;
              return (
                <div key={c.member_id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {c.display_name}
                      {isMe && <Badge variant="outline">Tú</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      {c.contribution_type === "percentage"
                        ? `${Number(c.contribution_value)}% de sus ingresos`
                        : "Cantidad fija"}
                      {isMe ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </p>
                  </div>
                  <Badge variant="secondary">€{Number(c.contribution_amount).toFixed(2)}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimos gastos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.expenses.slice(0, 10).map((expense) => (
            <div key={expense.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium flex items-center gap-2">
                  {expense.description || "Gasto"}
                  {expense.is_subscription && (
                    <Badge variant="outline" className="gap-1">
                      <Repeat className="h-3 w-3" />
                      {expense.recurrence || "recurrente"}
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(expense.date).toLocaleDateString("es-ES")} ·{" "}
                  {data.categories.find((c) => c.id === expense.category_id)?.name || "Sin categoría"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-bold text-destructive">-€{Number(expense.amount).toFixed(2)}</span>
                {data.isAdmin && (
                  <button
                    onClick={async () => {
                      const snapshot = { ...expense };
                      try {
                        await doDeleteExpense({ data: { id: expense.id } });
                        refresh();
                        undoableToast({
                          message: `Gasto "${expense.description || "Gasto"}" eliminado`,
                          undo: async () => {
                            await doRestoreExpense({ data: { row: snapshot } });
                            refresh();
                          },
                        });
                      } catch (err: any) {
                        toast.error(err?.message || "No se pudo eliminar");
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Eliminar gasto"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

        </CardContent>
      </Card>

      <ActivityList
        title="Actividad reciente de finanzas"
        items={activity ?? []}
        empty="Cuando alguien añada, elimine o restaure gastos, aparecerá aquí."
      />

      <AddExpenseDialog open={expenseOpen} onOpenChange={setExpenseOpen} data={data} onAdded={refresh} />
      <AddBudgetDialog open={budgetOpen} onOpenChange={setBudgetOpen} data={data} onAdded={refresh} />
      <MyContributionDialog open={contribOpen} onOpenChange={setContribOpen} data={data} onSaved={refresh} />
      <CategoriesDialog open={categoriesOpen} onOpenChange={setCategoriesOpen} data={data} onChanged={refresh} />
      <ThresholdDialog open={thresholdOpen} onOpenChange={setThresholdOpen} data={data} onSaved={refresh} />
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
  const doCreateCategory = useServerFn(createCategory);
  const doScan = useServerFn(scanTicket);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const handleScan = async (file: File) => {
    setScanning(true);
    try {
      const householdId = (await supabase.rpc("current_household")).data;
      if (!householdId) throw new Error("No household");
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const safeName = file.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${Date.now()}_${safeName}`;
      const { data: upload, error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(path, file, { contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const { data: signed, error: signedError } = await supabase.storage
        .from("receipts")
        .createSignedUrl(upload.path, 3600);
      if (signedError) throw signedError;

      const { data: receipt, error: receiptError } = await supabase
        .from("receipts")
        .insert({ household_id: householdId, image_url: signed.signedUrl, created_by: userId })
        .select()
        .single();
      if (receiptError) throw receiptError;

      const scanResult = await doScan({ data: { imageUrl: signed.signedUrl, receiptId: receipt.id } });
      if (scanResult.receipt.total) setAmount(String(scanResult.receipt.total));
      if (scanResult.receipt.store) setDescription(scanResult.receipt.store);
      toast.success("Ticket escaneado, revisa los datos");
    } catch (err: any) {
      toast.error(err.message || "Error al escanear ticket");
    } finally {
      setScanning(false);
    }
  };

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
      await doCreate({
        data: {
          amount: Number(amount),
          description: description || undefined,
          category_id: finalCategoryId || undefined,
          is_subscription: isRecurring,
          recurrence: isRecurring ? recurrence : undefined,
        },
      });
      toast.success("Gasto añadido");
      setAmount("");
      setDescription("");
      setNewCategory("");
      setIsRecurring(false);
      setRecurrence("monthly");
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
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo gasto</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Añadir desde ticket</Label>
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              ref={cameraRef}
              onChange={(e) => e.target.files?.[0] && handleScan(e.target.files[0])}
            />
            <input
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              ref={uploadRef}
              onChange={(e) => e.target.files?.[0] && handleScan(e.target.files[0])}
            />
            <Button type="button" variant="outline" onClick={() => cameraRef.current?.click()} disabled={scanning} className="flex-1">
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
              Cámara
            </Button>
            <Button type="button" variant="outline" onClick={() => uploadRef.current?.click()} disabled={scanning} className="flex-1">
              {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Subir ticket
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Se rellenarán automáticamente el importe y la descripción.</p>
        </div>

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
            <Label>O nueva categoría</Label>
            <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Ej. Supermercado" />
          </div>
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-4 w-4"
              />
              <Repeat className="h-4 w-4" />
              <span className="text-sm font-medium">Gasto periódico (internet, luz, streaming...)</span>
            </label>
            {isRecurring && (
              <div className="space-y-2">
                <Label>Frecuencia</Label>
                <select
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                >
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                  <option value="bimonthly">Bimensual</option>
                  <option value="quarterly">Trimestral</option>
                  <option value="yearly">Anual</option>
                </select>
              </div>
            )}
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

function MyContributionDialog({ open, onOpenChange, data, onSaved }: any) {
  const doSave = useServerFn(upsertMyContribution);
  const [income, setIncome] = useState<string>(
    data.mySalary?.amount != null ? String(data.mySalary.amount) : "",
  );
  const [type, setType] = useState<"percentage" | "fixed">(
    (data.mySalary?.contribution_type as any) || "percentage",
  );
  const [value, setValue] = useState<string>(
    data.mySalary?.contribution_value != null ? String(data.mySalary.contribution_value) : "",
  );
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await doSave({
        data: {
          amount: income === "" ? null : Number(income),
          contribution_type: type,
          contribution_value: value === "" ? 0 : Number(value),
          currency: "EUR",
        },
      });
      toast.success("Aporte actualizado");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  if (!data.myMemberId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mi aporte</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">No estás vinculado como miembro de este hogar.</p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mi aporte al hogar</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Mis ingresos mensuales (opcional, privado)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              placeholder="Sólo tú puedes ver este valor"
            />
            <p className="text-xs text-muted-foreground">
              El resto del hogar sólo verá tu cantidad de aporte, nunca tus ingresos.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Tipo de aporte</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === "percentage" ? "default" : "outline"}
                onClick={() => setType("percentage")}
                className="flex-1"
              >
                % de ingresos
              </Button>
              <Button
                type="button"
                variant={type === "fixed" ? "default" : "outline"}
                onClick={() => setType("fixed")}
                className="flex-1"
              >
                Cantidad fija
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{type === "percentage" ? "Porcentaje (%)" : "Cantidad fija (€)"}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Guardando..." : "Guardar aporte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoriesDialog({ open, onOpenChange, data, onChanged }: any) {
  const doCreate = useServerFn(createCategory);
  const doDelete = useServerFn(deleteCategory);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await doCreate({ data: { name: name.trim() } });
      setName("");
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await doDelete({ data: { id } });
      onChanged();
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Categorías de gasto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva categoría" />
          <Button type="submit" disabled={submitting || !name.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </form>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {data.categories.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay categorías.</p>
          )}
          {data.categories.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border p-2">
              <span className="text-sm">{c.name}</span>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ThresholdDialog({ open, onOpenChange, data, onSaved }: any) {
  const doSave = useServerFn(updateCriticalThreshold);
  const [value, setValue] = useState<string>(String(data.household.critical_threshold_percent));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(value);
    if (!n || n < 1 || n > 100) {
      toast.error("Introduce un valor entre 1 y 100");
      return;
    }
    setSubmitting(true);
    try {
      await doSave({ data: { critical_threshold_percent: n } });
      toast.success("Umbral actualizado");
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Umbral de gasto crítico</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Porcentaje (%)</Label>
            <Input
              type="number"
              min="1"
              max="100"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se mostrará una alerta cuando el gasto alcance este porcentaje del total de aportes.
            </p>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
