import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Sparkles, ArrowLeft, ShoppingCart, Lock, X, Utensils, Moon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  getWeekPlan,
  generateWeekPlan,
  updateMealSlot,
  getMissingIngredients,
} from "@/lib/meal-plan.functions";
import { listRecipes } from "@/lib/recipes.functions";
import { listStores, createShoppingItem, ensureDefaultLists } from "@/lib/shopping.functions";
import { autoImportFromInventory } from "@/lib/external-recipes.functions";

const weekPlanQO = queryOptions({
  queryKey: ["week-plan"],
  queryFn: () => getWeekPlan({ data: {} }),
});
const recipesQO = queryOptions({ queryKey: ["recipes"], queryFn: () => listRecipes() });
const missingQO = queryOptions({
  queryKey: ["week-plan", "missing"],
  queryFn: () => getMissingIngredients({ data: {} }),
});

export const Route = createFileRoute("/_authenticated/recipes/planner")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(weekPlanQO),
      context.queryClient.ensureQueryData(recipesQO),
      context.queryClient.ensureQueryData(missingQO),
    ]),
  head: () => ({ meta: [{ title: "Planificador semanal - HomeSync" }] }),
  component: PlannerPage,
});

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function PlannerPage() {
  const qc = useQueryClient();
  const { data: plan } = useSuspenseQuery(weekPlanQO);
  const { data: recipes } = useSuspenseQuery(recipesQO);
  const { data: missing } = useSuspenseQuery(missingQO);

  const doGenerate = useServerFn(generateWeekPlan);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<{
    dayId: string;
    slot: "lunch" | "dinner";
    current: any;
  } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["week-plan"] });
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res: any = await doGenerate({ data: { servings: 2 } });
      if (res?.recipes_available === 0) {
        toast.warning("No hay recetas guardadas: añade recetas primero para poder planificar.");
      } else if (res?.assigned === 0) {
        toast.info("No se asignó ninguna receta nueva (los huecos libres no encontraron candidatos válidos).");
      } else {
        toast.success(`Semana generada: ${res.assigned} huecos asignados`);
      }
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Error al generar");
    } finally {
      setGenerating(false);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/recipes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Planificador semanal</h2>
            <p className="text-muted-foreground">Semana del {plan.week_start}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShopOpen(true)} disabled={missing.length === 0}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Faltan {missing.length}
          </Button>
          <Button onClick={handleGenerate} disabled={generating}>
            <Sparkles className="mr-2 h-4 w-4" />
            {generating ? "Generando..." : "Regenerar semana"}
          </Button>
        </div>
      </div>

      {recipes.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-start gap-2 py-4">
            <p className="text-sm">
              Aún no tienes recetas guardadas. El planificador solo puede rellenar huecos con
              recetas del catálogo o con texto libre que escribas tú.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/recipes">Ir a Recetas para crear la primera</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">

        {plan.days.map((day: any) => (
          <Card key={day.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                {DAYS[day.day_of_week]}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <SlotCell
                icon={<Utensils className="h-3 w-3" />}
                label="Comida"
                dayId={day.id}
                slot="lunch"
                recipe={day.lunch}
                manual={day.lunch_manual}
                skipped={day.lunch_skipped}
                locked={day.lunch_locked}
                onEdit={() => setEditing({ dayId: day.id, slot: "lunch", current: day })}
              />
              <SlotCell
                icon={<Moon className="h-3 w-3" />}
                label="Cena"
                dayId={day.id}
                slot="dinner"
                recipe={day.dinner}
                manual={day.dinner_manual}
                skipped={day.dinner_skipped}
                locked={day.dinner_locked}
                onEdit={() => setEditing({ dayId: day.id, slot: "dinner", current: day })}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {editing && (
        <SlotEditor
          editing={editing}
          recipes={recipes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {shopOpen && (
        <MissingDialog
          missing={missing}
          onClose={() => setShopOpen(false)}
          onDone={() => {
            setShopOpen(false);
            toast.success("Añadido a la lista de la compra");
          }}
        />
      )}
    </div>
  );
}

function SlotCell({
  icon,
  label,
  recipe,
  manual,
  skipped,
  locked,
  onEdit,
}: {
  icon: React.ReactNode;
  label: string;
  dayId: string;
  slot: "lunch" | "dinner";
  recipe: any;
  manual: string | null;
  skipped: boolean;
  locked: boolean;
  onEdit: () => void;
}) {
  return (
    <button
      onClick={onEdit}
      className="w-full rounded-lg border border-border p-2 text-left transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          {icon} {label}
        </span>
        {locked && <Lock className="h-3 w-3" />}
      </div>
      {skipped ? (
        <p className="mt-1 text-sm italic text-muted-foreground">No como en casa</p>
      ) : recipe ? (
        <div className="mt-1">
          <p className="line-clamp-2 text-sm font-medium">{recipe.title}</p>
          {recipe.protein_group && (
            <Badge variant="outline" className="mt-1 text-[10px]">
              {recipe.protein_group}
            </Badge>
          )}
        </div>
      ) : manual ? (
        <p className="mt-1 line-clamp-2 text-sm">{manual}</p>
      ) : (
        <p className="mt-1 text-sm italic text-muted-foreground">Sin asignar</p>
      )}
    </button>
  );
}

function SlotEditor({
  editing,
  recipes,
  onClose,
  onSaved,
}: {
  editing: { dayId: string; slot: "lunch" | "dinner"; current: any };
  recipes: any[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const prefix = editing.slot;
  const [recipeId, setRecipeId] = useState<string>(
    editing.current[`${prefix}_recipe_id`] || "",
  );
  const [manual, setManual] = useState<string>(editing.current[`${prefix}_manual`] || "");
  const [skipped, setSkipped] = useState<boolean>(editing.current[`${prefix}_skipped`] || false);
  const [saving, setSaving] = useState(false);
  const doUpdate = useServerFn(updateMealSlot);

  const save = async (payload: any) => {
    setSaving(true);
    try {
      await doUpdate({ data: { day_id: editing.dayId, slot: editing.slot, lock: true, ...payload } });
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {editing.slot === "lunch" ? "comida" : "cena"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Receta del catálogo</Label>
            <Select value={recipeId} onValueChange={setRecipeId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una receta" />
              </SelectTrigger>
              <SelectContent>
                {recipes.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>O texto libre</Label>
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ej: pizza congelada"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              id="skip"
              checked={skipped}
              onChange={(e) => setSkipped(e.target.checked)}
            />
            <label htmlFor="skip">No como en casa</label>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="sm:mr-auto"
            onClick={() =>
              save({ recipe_id: null, manual: null, skipped: false, lock: false })
            }
          >
            <X className="mr-2 h-4 w-4" />
            Vaciar y desbloquear
          </Button>
          {skipped ? (
            <Button disabled={saving} onClick={() => save({ skipped: true })}>
              Marcar como fuera
            </Button>
          ) : manual.trim() ? (
            <Button disabled={saving} onClick={() => save({ manual: manual.trim(), skipped: false })}>
              Guardar texto
            </Button>
          ) : (
            <Button
              disabled={saving || !recipeId}
              onClick={() => save({ recipe_id: recipeId, manual: null, skipped: false })}
            >
              Asignar receta
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MissingDialog({
  missing,
  onClose,
  onDone,
}: {
  missing: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [storeId, setStoreId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const doList = useServerFn(listStores);
  const doEnsure = useServerFn(ensureDefaultLists);
  const doCreate = useServerFn(createShoppingItem);
  const { data: stores } = useSuspenseQuery(
    queryOptions({ queryKey: ["stores"], queryFn: () => doList() }),
  );

  const handleAdd = async () => {
    setAdding(true);
    try {
      await doEnsure();
      const store = stores.find((s: any) => s.id === storeId) ?? stores[0];
      if (!store) throw new Error("Crea una tienda primero");
      const { data: lists } = (await (
        await import("@/integrations/supabase/client")
      ).supabase
        .from("shopping_lists")
        .select("id")
        .eq("store_id", store.id)
        .eq("is_archived", false)
        .limit(1)) as any;
      const listId = lists?.[0]?.id;
      if (!listId) throw new Error("No hay lista activa");
      for (const item of missing) {
        await doCreate({
          data: {
            shopping_list_id: listId,
            name: item.name,
            quantity: Math.ceil(item.qty),
            unit: item.unit || undefined,
          },
        });
      }
      qc.invalidateQueries({ queryKey: ["shopping"] });
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ingredientes que faltan ({missing.length})</DialogTitle>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {missing.map((m: any) => (
            <div
              key={m.name}
              className="flex items-center justify-between rounded border border-border px-3 py-2 text-sm"
            >
              <span>{m.name}</span>
              <span className="text-muted-foreground">
                {Math.ceil(m.qty)} {m.unit || ""}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <Label>Tienda</Label>
          <Select value={storeId || stores[0]?.id} onValueChange={setStoreId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stores.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={handleAdd} disabled={adding || missing.length === 0}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            Añadir a la compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
