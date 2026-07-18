import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, ChefHat, Clock, Users, Sparkles, Search, Trash2, X, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";
import { listRecipes, createRecipe, deleteRecipes } from "@/lib/recipes.functions";
import { toast } from "sonner";

const recipesQueryOptions = queryOptions({
  queryKey: ["recipes"],
  queryFn: () => listRecipes(),
});

export const Route = createFileRoute("/_authenticated/recipes/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(recipesQueryOptions),
  head: () => ({
    meta: [{ title: "Recetas - HomeSync" }],
  }),
  component: RecipesPage,
});

const dietaryOptions: string[] = ["Vegetariano", "Vegano", "Sin gluten", "Bajo en sal", "Alto en proteína"];

function RecipesPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(recipesQueryOptions);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [servings, setServings] = useState("4");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const doCreate = useServerFn(createRecipe);
  const doDeleteRecipes = useServerFn(deleteRecipes);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["recipes"] });

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    try {
      const res: any = await doDeleteRecipes({ data: { ids: Array.from(selectedIds) } });
      toast.success(`${res.deleted} recetas borradas`);
      await refresh();
      exitSelectMode();
      setConfirmDeleteOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al borrar recetas");
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await doCreate({
        data: {
          title: title.trim(),
          description: description || undefined,
          servings: Number(servings) || 4,
          dietary_tags: tags,
        },
      });
      toast.success("Receta añadida");
      setTitle("");
      setDescription("");
      setTags([]);
      refresh();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir receta");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Recetas</h2>
          <p className="text-muted-foreground">Tus recetas y sugerencias de IA</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectMode ? (
            <>
              <Button variant="outline" onClick={exitSelectMode}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Borrar ({selectedIds.size})
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setSelectMode(true)} disabled={data.length === 0}>
              <Trash2 className="mr-2 h-4 w-4" />
              Borrar recetas
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link to="/recipes/discover">
              <Search className="mr-2 h-4 w-4" />
              Descubrir
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/recipes/planner">
              <Sparkles className="mr-2 h-4 w-4" />
              Planificador
            </Link>
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Receta
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((recipe: any) => (
          <Card
            key={recipe.id}
            className={`overflow-hidden transition-colors hover:bg-accent/40 ${
              selectedIds.has(recipe.id) ? "ring-2 ring-primary" : ""
            }`}
          >
            {selectMode ? (
              <button type="button" onClick={() => toggleSelected(recipe.id)} className="block w-full text-left">
                <RecipeCardContent recipe={recipe} selectable selected={selectedIds.has(recipe.id)} />
              </button>
            ) : (
              <Link to="/recipes/$recipeId" params={{ recipeId: recipe.id }} className="block">
                <RecipeCardContent recipe={recipe} />
              </Link>
            )}
          </Card>
        ))}
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar recetas seleccionadas</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán {selectedIds.size} recetas de tu biblioteca. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSelected} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva receta</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Comensales</Label>
              <Input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Filtros dietéticos</Label>
              <div className="flex flex-wrap gap-2">
                {dietaryOptions.map((tag: any) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
                    }
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      tags.includes(tag)
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !title.trim()} className="w-full">
                {submitting ? "Añadiendo..." : "Añadir receta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RecipeCardContent({
  recipe,
  selected = false,
  selectable = false,
}: {
  recipe: any;
  selected?: boolean;
  selectable?: boolean;
}) {
  return (
    <CardContent className="p-4">
      <div className="flex items-start justify-between">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary">
          <ChefHat className="h-6 w-6 text-primary" />
        </div>
        {selectable ? (
          <span
            aria-label={selected ? "Receta seleccionada" : "Receta no seleccionada"}
            className={`grid h-5 w-5 place-items-center rounded-sm border ${
              selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
            }`}
          >
            {selected && <span className="h-2 w-2 rounded-full bg-current" />}
          </span>
        ) : recipe.source === "ai" ? (
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            IA
          </Badge>
        ) : null}
      </div>
      <h3 className="mt-3 text-lg font-bold">{recipe.title}</h3>
      <p className="line-clamp-2 text-sm text-muted-foreground">{recipe.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {recipe.servings && (
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {recipe.servings} pers.
          </span>
        )}
        {(recipe.prep_time || 0) + (recipe.cook_time || 0) > 0 && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {(recipe.prep_time || 0) + (recipe.cook_time || 0)} min
          </span>
        )}
      </div>
      {recipe.dietary_tags && recipe.dietary_tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {recipe.dietary_tags.map((tag: any) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </CardContent>
  );
}
