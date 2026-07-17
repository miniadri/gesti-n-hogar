import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Search, Download, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  searchExternalRecipes,
  importExternalRecipe,
  autoImportFromInventory,
  type ExternalHit,
} from "@/lib/external-recipes.functions";

export const Route = createFileRoute("/_authenticated/recipes/discover")({
  head: () => ({ meta: [{ title: "Descubrir recetas - HomeSync" }] }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const qc = useQueryClient();
  const doSearch = useServerFn(searchExternalRecipes);
  const doImport = useServerFn(importExternalRecipe);
  const doAuto = useServerFn(autoImportFromInventory);

  const [query, setQuery] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [diet, setDiet] = useState<string>("");
  const [mealType, setMealType] = useState<"comida" | "cena" | "ambas">("ambas");
  const [loading, setLoading] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [hits, setHits] = useState<ExternalHit[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const handleSearch = async () => {
    setLoading(true);
    setNote("");
    try {
      const ings = ingredients
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res: any = await doSearch({
        data: {
          query: query || undefined,
          ingredients: ings.length ? ings : undefined,
          diet: diet || undefined,
          number: 12,
        },
      });
      setHits(res.hits);
      setProvider(res.provider);
      if (res.note) setNote(res.note);
      if (res.hits.length === 0) toast.info("Sin resultados. Prueba con otros términos.");
    } catch (e: any) {
      toast.error(e.message || "Error en la búsqueda");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async (hit: ExternalHit) => {
    setImporting(`${hit.source}:${hit.external_id}`);
    try {
      const res: any = await doImport({
        data: {
          source: hit.source,
          external_id: hit.external_id,
          meal_type: mealType,
          translate: true,
        },
      });
      if (res.already) toast.info("Esa receta ya estaba en tu biblioteca");
      else toast.success("Receta importada y traducida");
      qc.invalidateQueries({ queryKey: ["recipes"] });
    } catch (e: any) {
      toast.error(e.message || "Error al importar");
    } finally {
      setImporting(null);
    }
  };

  const handleAuto = async () => {
    setAutoLoading(true);
    try {
      const res: any = await doAuto({ data: { count: 5, meal_type: mealType } });
      toast.success(
        `${res.imported} recetas importadas usando tu inventario (${res.provider})`,
      );
      qc.invalidateQueries({ queryKey: ["recipes"] });
    } catch (e: any) {
      toast.error(e.message || "Error");
    } finally {
      setAutoLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/recipes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Descubrir recetas</h2>
          <p className="text-muted-foreground">
            Busca en Spoonacular y TheMealDB. Se traducen al español al importar.
          </p>
        </div>
        <Button onClick={handleAuto} disabled={autoLoading} variant="secondary">
          {autoLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Sugerir con mi inventario
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-3 py-4 md:grid-cols-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Buscar por nombre</Label>
            <Input
              placeholder="Ej: pasta, curry, tortilla"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Ingredientes (separados por coma)</Label>
            <Input
              placeholder="Ej: pollo, arroz, tomate"
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <div className="space-y-1">
            <Label>Dieta</Label>
            <Select value={diet} onValueChange={setDiet}>
              <SelectTrigger>
                <SelectValue placeholder="Cualquiera" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vegetarian">Vegetariana</SelectItem>
                <SelectItem value="vegan">Vegana</SelectItem>
                <SelectItem value="gluten free">Sin gluten</SelectItem>
                <SelectItem value="ketogenic">Keto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Al importar, para…</Label>
            <Select value={mealType} onValueChange={(v: any) => setMealType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ambas">Comida o cena</SelectItem>
                <SelectItem value="comida">Solo comida</SelectItem>
                <SelectItem value="cena">Solo cena</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end md:col-span-2">
            <Button onClick={handleSearch} disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Buscar
            </Button>
          </div>
        </CardContent>
      </Card>

      {provider && (
        <div className="text-xs text-muted-foreground">
          Fuente: <Badge variant="outline">{provider}</Badge>
          {note && <span className="ml-2 italic">{note}</span>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hits.map((hit) => {
          const busy = importing === `${hit.source}:${hit.external_id}`;
          return (
            <Card key={`${hit.source}-${hit.external_id}`} className="overflow-hidden">
              {hit.image && (
                <img
                  src={hit.image}
                  alt={hit.title}
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
              )}
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-tight">{hit.title}</h3>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {hit.source}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {hit.ready_in && <span>{hit.ready_in} min</span>}
                  {hit.servings && <span>{hit.servings} pers.</span>}
                </div>
                {hit.used_ingredients && hit.used_ingredients.length > 0 && (
                  <p className="text-[11px] text-emerald-600">
                    Tienes: {hit.used_ingredients.slice(0, 3).join(", ")}
                  </p>
                )}
                {hit.missed_ingredients && hit.missed_ingredients.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Faltan: {hit.missed_ingredients.slice(0, 3).join(", ")}
                  </p>
                )}
                <Button
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  onClick={() => handleImport(hit)}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Importar
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
