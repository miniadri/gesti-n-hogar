import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Square,
  Trash2,
  Sparkles,
  Clock,
  Volume2,
  Settings2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client-app";
import {
  listSteps,
  createStep,
  deleteStep,
  adjustMinutes,
} from "@/lib/recipe-steps.functions";
import {
  listAppliances,
  APPLIANCE_LABELS,
  type ApplianceType,
} from "@/lib/appliances.functions";
import { isSpeechSupported, speak, stop } from "@/lib/tts";

const recipeQO = (id: string) =>
  queryOptions({
    queryKey: ["recipe", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("recipes").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
const stepsQO = (id: string) =>
  queryOptions({
    queryKey: ["recipe", id, "steps"],
    queryFn: () => listSteps({ data: { recipe_id: id } }),
  });
const appliancesQO = queryOptions({
  queryKey: ["appliances"],
  queryFn: () => listAppliances(),
});

export const Route = createFileRoute("/_authenticated/recipes/$recipeId")({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(recipeQO(params.recipeId)),
      context.queryClient.ensureQueryData(stepsQO(params.recipeId)),
      context.queryClient.ensureQueryData(appliancesQO),
    ]),
  head: () => ({ meta: [{ title: "Receta - HomeSync" }] }),
  component: RecipePage,
});

function RecipePage() {
  const { recipeId } = Route.useParams();
  const qc = useQueryClient();
  const { data: recipe } = useSuspenseQuery(recipeQO(recipeId));
  const { data: steps } = useSuspenseQuery(stepsQO(recipeId));
  const { data: appliances } = useSuspenseQuery(appliancesQO);

  const defaultAppliance =
    (appliances.find((a: any) => a.is_default)?.type as ApplianceType) ||
    (appliances[0]?.type as ApplianceType) ||
    "manual";
  const [appliance, setAppliance] = useState<ApplianceType>(defaultAppliance);
  const [addOpen, setAddOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => () => stop(), []);

  const refresh = () => qc.invalidateQueries({ queryKey: ["recipe", recipeId, "steps"] });
  const doDelete = useServerFn(deleteStep);

  const speakStep = (id: string, text: string) => {
    if (!isSpeechSupported()) {
      toast.error("Este navegador no soporta voz");
      return;
    }
    setSpeakingId(id);
    speak(text, {
      onEnd: () => setSpeakingId(null),
      onError: () => setSpeakingId(null),
    });
  };

  const speakAll = () => {
    if (!isSpeechSupported()) {
      toast.error("Este navegador no soporta voz");
      return;
    }
    const speakIndex = (i: number) => {
      if (i >= steps.length) {
        setSpeakingId(null);
        return;
      }
      const s: any = steps[i];
      setSpeakingId(s.id);
      const min = adjustMinutes(
        s.base_minutes,
        s.technique,
        appliance,
        (s.recipe_step_appliance_times ?? []).find((t: any) => t.appliance_type === appliance)?.minutes,
      );
      const suffix = min ? `. Tiempo estimado: ${min} minutos.` : "";
      speak(`Paso ${i + 1}. ${s.text}${suffix}`, {
        onEnd: () => speakIndex(i + 1),
        onError: () => setSpeakingId(null),
      });
    };
    speakIndex(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/recipes">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{recipe.title}</h2>
            {recipe.description && (
              <p className="text-muted-foreground">{recipe.description}</p>
            )}
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {recipe.protein_group && <Badge variant="outline">{recipe.protein_group}</Badge>}
              {recipe.servings && <Badge variant="outline">{recipe.servings} pers.</Badge>}
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="h-4 w-4" />
            Cocinado con
          </CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/settings/appliances">Configurar</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {appliances.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Añade tus electrodomésticos en{" "}
              <Link to="/settings/appliances" className="underline">
                Ajustes
              </Link>{" "}
              para ajustar los tiempos automáticamente.
            </p>
          ) : (
            <Select value={appliance} onValueChange={(v) => setAppliance(v as ApplianceType)}>
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {appliances.map((a: any) => (
                  <SelectItem key={a.id} value={a.type}>
                    {a.name} — {APPLIANCE_LABELS[a.type as ApplianceType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Pasos</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={speakAll} disabled={steps.length === 0}>
            <Volume2 className="mr-2 h-4 w-4" />
            Leer todos
          </Button>
          <Button variant="ghost" size="sm" onClick={() => stop()}>
            <Square className="mr-2 h-4 w-4" />
            Parar
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Paso
          </Button>
        </div>
      </div>

      {steps.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aún no hay pasos. Añade el primero para poder leerlo por voz.
          </CardContent>
        </Card>
      ) : (
        <ol className="space-y-3">
          {steps.map((s: any, idx: number) => {
            const override = (s.recipe_step_appliance_times ?? []).find(
              (t: any) => t.appliance_type === appliance,
            )?.minutes;
            const min = adjustMinutes(s.base_minutes, s.technique, appliance, override);
            const isSpeaking = speakingId === s.id;
            return (
              <li key={s.id}>
                <Card className={isSpeaking ? "border-primary" : ""}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 space-y-2">
                      <p className="text-sm">{s.text}</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {min > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {min} min
                          </span>
                        )}
                        {s.technique && <Badge variant="outline">{s.technique}</Badge>}
                        {s.is_prep_ahead && (
                          <Badge variant="secondary" className="bg-primary/10 text-primary">
                            <Sparkles className="mr-1 h-3 w-3" />
                            Adelantable
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          isSpeaking
                            ? (stop(), setSpeakingId(null))
                            : speakStep(
                                s.id,
                                `Paso ${idx + 1}. ${s.text}${min ? `. Tiempo estimado: ${min} minutos.` : ""}`,
                              )
                        }
                      >
                        {isSpeaking ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={async () => {
                          await doDelete({ data: { id: s.id } });
                          refresh();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      )}

      {addOpen && (
        <AddStepDialog
          recipeId={recipeId}
          nextOrder={steps.length}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

const TECHNIQUES = ["saltear", "cocer", "freir", "hornear", "asar", "calentar", "corte", "marinar"];

function AddStepDialog({
  recipeId,
  nextOrder,
  onClose,
  onSaved,
}: {
  recipeId: string;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [minutes, setMinutes] = useState("");
  const [technique, setTechnique] = useState("");
  const [prep, setPrep] = useState(false);
  const [saving, setSaving] = useState(false);
  const doCreate = useServerFn(createStep);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await doCreate({
        data: {
          recipe_id: recipeId,
          step_order: nextOrder,
          text: text.trim(),
          base_minutes: Number(minutes) || 0,
          technique: technique || undefined,
          is_prep_ahead: prep,
        },
      });
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo paso</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Minutos base</Label>
              <Input
                type="number"
                min="0"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Técnica</Label>
              <Select value={technique} onValueChange={setTechnique}>
                <SelectTrigger>
                  <SelectValue placeholder="Ninguna" />
                </SelectTrigger>
                <SelectContent>
                  {TECHNIQUES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={prep} onChange={(e) => setPrep(e.target.checked)} />
            Se puede adelantar (aviso el día anterior)
          </label>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || !text.trim()}>
            Añadir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
