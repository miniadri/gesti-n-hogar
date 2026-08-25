import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Loader2, Mic, MicOff, Navigation, Search, Volume2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { addShoppingItemByName, removeShoppingItemByName } from "@/lib/shopping.functions";
import { listRecipes } from "@/lib/recipes.functions";

type VoiceIntent =
  | { type: "add_shopping"; item: string; quantity: number }
  | { type: "remove_shopping"; item: string }
  | { type: "open"; target: keyof typeof NAV_TARGETS }
  | { type: "find_recipe"; query: string }
  | { type: "medication_status" }
  | { type: "alerts_status" }
  | { type: "sos_help" }
  | { type: "unknown"; text: string };

type AssistantState = "idle" | "listening" | "confirming" | "running" | "unsupported";

const NAV_TARGETS = {
  compra: "/shopping",
  tareas: "/tasks",
  inventario: "/inventory",
  recetas: "/recipes",
  salud: "/medications",
  calendario: "/calendar",
  cuadrante: "/calendar/schedule",
  ajustes: "/settings",
  escaner: "/inventory/kitchen",
} as const;

const COMMAND_EXAMPLES = [
  "Añade leche a la compra",
  "Quita pan de la compra",
  "Busca receta de lentejas",
  "Abrir inventario",
  "Abrir tareas",
  "Abrir cuadrante",
  "Qué medicinas hay pendientes",
  "Tengo una emergencia",
];

export function KioskVoiceAssistant() {
  const navigate = useNavigate();
  const doAddShopping = useServerFn(addShoppingItemByName);
  const doRemoveShopping = useServerFn(removeShoppingItemByName);
  const doListRecipes = useServerFn(listRecipes);

  const recognitionRef = useRef<any>(null);
  const [state, setState] = useState<AssistantState>("idle");
  const [transcript, setTranscript] = useState("");
  const [lastReply, setLastReply] = useState("Pulsa Hablar y dime una orden de HomeSync.");
  const [pendingIntent, setPendingIntent] = useState<VoiceIntent | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [matchedRecipe, setMatchedRecipe] = useState<any | null>(null);

  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;
  const recognitionSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort?.();
      if (speechSupported) window.speechSynthesis.cancel();
    };
  }, [speechSupported]);

  const speak = useCallback(
    (message: string) => {
      setLastReply(message);
      if (!speechEnabled || !speechSupported) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = "es-ES";
        utterance.rate = 0.96;
        window.speechSynthesis.speak(utterance);
      } catch {
        // La respuesta visual sigue funcionando aunque el navegador no pueda hablar.
      }
    },
    [speechEnabled, speechSupported],
  );

  const startListening = () => {
    if (!recognitionSupported) {
      setState("unsupported");
      speak("Este navegador no permite reconocimiento de voz desde la web. Puedes usar los botones del modo kiosko.");
      return;
    }

    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setTranscript("");
      setPendingIntent(null);
      setMatchedRecipe(null);
      setState("listening");
      setLastReply("Escuchando...");
    };
    recognition.onerror = () => {
      setState("idle");
      speak("No he podido escucharte bien. Prueba otra vez acercándote al micrófono.");
    };
    recognition.onend = () => {
      setState((current) => (current === "listening" ? "idle" : current));
    };
    recognition.onresult = (event: any) => {
      const text = String(event.results?.[0]?.[0]?.transcript ?? "").trim();
      setTranscript(text);
      const intent = parseVoiceIntent(text);
      setPendingIntent(intent);
      setState("confirming");
      speak(intentSummary(intent));
    };
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.abort?.();
    setState("idle");
  };

  const confirmIntent = async () => {
    if (!pendingIntent) return;
    setState("running");
    try {
      if (pendingIntent.type === "add_shopping") {
        const result: any = await doAddShopping({ data: { name: pendingIntent.item, quantity: pendingIntent.quantity } });
        speak(result?.mode === "updated"
          ? `${pendingIntent.item} ya estaba en la compra. He aumentado la cantidad.`
          : `${pendingIntent.item} añadido a la compra.`);
        toast.success("Compra actualizada por voz");
      } else if (pendingIntent.type === "remove_shopping") {
        const result: any = await doRemoveShopping({ data: { name: pendingIntent.item } });
        speak(result?.found ? `${result.item?.name ?? pendingIntent.item} eliminado de la compra.` : `No he encontrado ${pendingIntent.item} pendiente en la compra.`);
        toast.success(result?.found ? "Producto eliminado" : "No encontrado");
      } else if (pendingIntent.type === "open") {
        await navigate({ to: NAV_TARGETS[pendingIntent.target] as any });
        speak(`Abriendo ${targetLabel(pendingIntent.target)}.`);
      } else if (pendingIntent.type === "find_recipe") {
        const recipes: any[] = await doListRecipes();
        const match = findBestRecipe(recipes, pendingIntent.query);
        if (!match) {
          speak(`No encuentro una receta guardada para ${pendingIntent.query}. Puedes abrir recetas y crearla o descubrir nuevas recetas.`);
          setMatchedRecipe(null);
        } else {
          setMatchedRecipe(match);
          speak(`He encontrado ${match.title}. Puedes abrirla desde aquí.`);
        }
      } else if (pendingIntent.type === "medication_status") {
        await navigate({ to: "/medications" as any });
        speak("Abro Salud para revisar medicación y tomas pendientes.");
      } else if (pendingIntent.type === "alerts_status") {
        await navigate({ to: "/settings/notifications" as any });
        speak("Abro notificaciones para revisar avisos.");
      } else if (pendingIntent.type === "sos_help") {
        speak("Para evitar falsas alarmas, el SOS por voz no se envía automáticamente. Usa el botón SOS y mantenlo pulsado.");
      } else {
        speak("Solo puedo ayudarte con compra, inventario, recetas, salud, calendario, cuadrante y SOS.");
      }
      setPendingIntent(null);
    } catch (err: any) {
      speak(err?.message || "No he podido ejecutar la orden.");
      toast.error(err?.message || "Error en asistente de voz");
    } finally {
      setState("idle");
    }
  };

  const cancelIntent = () => {
    setPendingIntent(null);
    setMatchedRecipe(null);
    setState("idle");
    speak("Orden cancelada.");
  };

  return (
    <Card className="border-primary/20">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">Asistente de voz</p>
              <p className="text-sm text-muted-foreground">Comandos cerrados para HomeSync</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              title={speechEnabled ? "Desactivar voz" : "Activar voz"}
              onClick={() => setSpeechEnabled((value) => !value)}
            >
              <Volume2 className={cn("h-5 w-5", !speechEnabled && "opacity-35")} />
              <span className="sr-only">{speechEnabled ? "Desactivar voz" : "Activar voz"}</span>
            </Button>
            <Button
              onClick={state === "listening" ? stopListening : startListening}
              disabled={state === "running"}
              className="min-w-32"
            >
              {state === "running" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : state === "listening" ? (
                <MicOff className="mr-2 h-4 w-4" />
              ) : (
                <Mic className="mr-2 h-4 w-4" />
              )}
              {state === "listening" ? "Parar" : "Hablar"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_1.25fr]">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Último comando</p>
            <p className="mt-1 min-h-6 text-sm">{transcript || "Todavía no hay comando."}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Respuesta</p>
            <p className="mt-1 text-sm">{lastReply}</p>
          </div>
        </div>

        {state === "unsupported" && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            El reconocimiento de voz web no está disponible en este navegador. En Android prueba Chrome; en Raspberry puede depender de Chromium y del micrófono.
          </div>
        )}

        {pendingIntent && state === "confirming" && (
          <div className="rounded-md border bg-card p-3">
            <p className="text-sm font-semibold">Confirmar orden</p>
            <p className="mt-1 text-sm text-muted-foreground">{intentSummary(pendingIntent)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={confirmIntent}>
                <Check className="mr-2 h-4 w-4" />
                Confirmar
              </Button>
              <Button variant="outline" onClick={cancelIntent}>
                <X className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {matchedRecipe && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 p-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{matchedRecipe.title}</p>
              <p className="truncate text-xs text-muted-foreground">{matchedRecipe.description || "Receta guardada"}</p>
            </div>
            <Button asChild size="sm">
              <Link to="/recipes/$recipeId" params={{ recipeId: matchedRecipe.id }}>
                <Navigation className="mr-2 h-4 w-4" />
                Abrir
              </Link>
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {COMMAND_EXAMPLES.map((example) => (
            <Badge key={example} variant="secondary" className="font-normal">
              {example}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function parseVoiceIntent(rawText: string): VoiceIntent {
  const text = normalize(rawText);
  if (!text) return { type: "unknown", text: rawText };

  const addShopping = matchShoppingItem(text, ["anade", "anadir", "agrega", "agregar", "pon", "mete", "apunta"]);
  if (addShopping) {
    return { type: "add_shopping", item: cleanItem(addShopping), quantity: 1 };
  }

  const removeShopping = matchShoppingItem(text, ["quita", "quitar", "borra", "elimina", "eliminar"]);
  if (removeShopping) {
    return { type: "remove_shopping", item: cleanItem(removeShopping) };
  }

  const recipeQuery = matchAfter(text, ["busca receta de", "buscar receta de", "abre receta de", "abrir receta de"], [""]);
  if (recipeQuery) return { type: "find_recipe", query: cleanItem(recipeQuery) };
  if (/recetas?/.test(text) && /(abre|abrir|ve|ir)/.test(text)) return { type: "open", target: "recetas" };

  const target = Object.keys(NAV_TARGETS).find((key) => text.includes(key)) as keyof typeof NAV_TARGETS | undefined;
  if (target && /(abre|abrir|ve|ir|muestra|mostrar)/.test(text)) return { type: "open", target };

  if (/medic|pastilla|toma/.test(text) && /(pendiente|hay|revisa|mostrar|muestra|que)/.test(text)) {
    return { type: "medication_status" };
  }
  if (/aviso|notificacion|recordatorio/.test(text)) return { type: "alerts_status" };
  if (/sos|emergencia|ayuda/.test(text)) return { type: "sos_help" };

  return { type: "unknown", text: rawText };
}

function intentSummary(intent: VoiceIntent) {
  if (intent.type === "add_shopping") return `Voy a añadir ${intent.item} a la lista de la compra.`;
  if (intent.type === "remove_shopping") return `Voy a quitar ${intent.item} de la lista de la compra.`;
  if (intent.type === "open") return `Voy a abrir ${targetLabel(intent.target)}.`;
  if (intent.type === "find_recipe") return `Voy a buscar ${intent.query} entre tus recetas guardadas.`;
  if (intent.type === "medication_status") return "Voy a abrir Salud para revisar medicación pendiente.";
  if (intent.type === "alerts_status") return "Voy a abrir los avisos y notificaciones.";
  if (intent.type === "sos_help") return "El SOS necesita confirmación manual para evitar falsas alarmas.";
  return "No reconozco esa orden como una acción de HomeSync.";
}

function targetLabel(target: keyof typeof NAV_TARGETS) {
  if (target === "escaner") return "escáner";
  return target;
}

function findBestRecipe(recipes: any[], query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return null;
  return (
    recipes.find((recipe) => normalize(recipe.title).includes(normalizedQuery)) ??
    recipes.find((recipe) => normalizedQuery.split(" ").some((part) => part.length > 2 && normalize(recipe.title).includes(part))) ??
    null
  );
}

function matchAfter(text: string, prefixes: string[], suffixes: string[]) {
  for (const prefix of prefixes) {
    const index = text.indexOf(prefix);
    if (index < 0) continue;
    let value = text.slice(index + prefix.length).trim();
    for (const suffix of suffixes) {
      if (suffix && value.endsWith(suffix.trim())) {
        value = value.slice(0, -suffix.trim().length).trim();
      }
    }
    value = value.replace(/\b(a la|en la|de la|lista|compra)\b/g, " ").replace(/\s+/g, " ").trim();
    if (value) return value;
  }
  return "";
}

function matchShoppingItem(text: string, verbs: string[]) {
  for (const verb of verbs) {
    const patterns = [
      new RegExp(`^${verb}\\s+(.+?)\\s+(?:a|en|de)\\s+la\\s+(?:lista\\s+de\\s+)?compra$`),
      new RegExp(`^${verb}\\s+(.+?)\\s+(?:a|en|de)\\s+compra$`),
      new RegExp(`^${verb}\\s+(.+?)\\s+(?:a|en|de)\\s+la\\s+lista$`),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return "";
}

function cleanItem(value: string) {
  return value.replace(/\b(por favor|gracias)\b/g, "").replace(/\s+/g, " ").trim();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
