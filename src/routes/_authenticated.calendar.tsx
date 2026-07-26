import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Plus, Calendar as CalendarIcon, Clock, Users, Lock, Settings, ChevronLeft, ChevronRight, Palette } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { listEvents, createEvent, deleteEvent, restoreEvent, togglePublicEvent } from "@/lib/calendar.functions";
import { getGoogleCalendarStatus } from "@/lib/google-calendar.functions";
import { undoableToast } from "@/hooks/use-undoable";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const calendarQueryOptions = queryOptions({
  queryKey: ["calendar"],
  queryFn: () => listEvents(),
});

export const Route = createFileRoute("/_authenticated/calendar")({
  loader: ({ context }) => context.queryClient.ensureQueryData(calendarQueryOptions),
  head: () => ({
    meta: [{ title: "Calendario - HomeSync" }],
  }),
  component: CalendarPage,
});

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  family: "#3b82f6",
  medical: "#ef4444",
  school: "#f59e0b",
  work: "#8b5cf6",
  birthday: "#ec4899",
  other: "#64748b",
};

const categories = [
  { value: "family", label: "Familiar" },
  { value: "medical", label: "Médico" },
  { value: "school", label: "Escuela" },
  { value: "work", label: "Trabajo" },
  { value: "birthday", label: "Cumpleaños" },
  { value: "other", label: "Otro" },
];

const COLOR_STORAGE_KEY = "homesync.calendar.categoryColors";
const PALETTE = ["#3b82f6","#ef4444","#f59e0b","#10b981","#8b5cf6","#ec4899","#14b8a6","#f97316","#64748b","#0ea5e9","#a855f7","#eab308"];

function loadColors(): Record<string, string> {
  if (typeof window === "undefined") return DEFAULT_CATEGORY_COLORS;
  try {
    const raw = window.localStorage.getItem(COLOR_STORAGE_KEY);
    return { ...DEFAULT_CATEGORY_COLORS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return DEFAULT_CATEGORY_COLORS;
  }
}

function CalendarPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(calendarQueryOptions);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("12:00");
  const [category, setCategory] = useState("family");
  const [isPublic, setIsPublic] = useState(false);
  const [pushToGoogle, setPushToGoogle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [colors, setColors] = useState<Record<string, string>>(() => loadColors());
  const [colorsOpen, setColorsOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLOR_STORAGE_KEY, JSON.stringify(colors));
    } catch {}
  }, [colors]);

  const colorFor = (value?: string | null) => colors[value ?? "other"] ?? colors.other;

  const doCreate = useServerFn(createEvent);
  const doDelete = useServerFn(deleteEvent);
  const doRestore = useServerFn(restoreEvent);
  const doTogglePublic = useServerFn(togglePublicEvent);
  const getGStatus = useServerFn(getGoogleCalendarStatus);

  const { data: gStatus } = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => getGStatus(),
  });

  // Fetch current user id once
  if (currentUserId === null) {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["calendar"] });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const eventsByDay = new Map<string, any[]>();
  for (const event of data) {
    const day = format(parseISO(event.start_at), "yyyy-MM-dd");
    if (!eventsByDay.has(day)) eventsByDay.set(day, []);
    eventsByDay.get(day)!.push(event);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;
    setSubmitting(true);
    try {
      const start = new Date(`${date}T${time}`).toISOString();
      await doCreate({
        data: {
          title: title.trim(),
          start_at: start,
          category,
          is_public: isPublic,
          push_to_google: pushToGoogle && !!gStatus?.connected,
        },
      });
      toast.success("Evento añadido");
      setTitle("");
      setIsPublic(false);
      setPushToGoogle(false);
      refresh();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir evento");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Calendario familiar</h2>
          <p className="text-muted-foreground">
            {format(currentDate, "MMMM yyyy", { locale: es })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" asChild title="Google Calendar">
            <Link to="/settings/google-calendar">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
            Hoy
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Evento
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-7 gap-1 text-center text-sm font-medium text-muted-foreground">
            {["L", "M", "X", "J", "V", "S", "D"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {days.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const dayEvents = eventsByDay.get(dayKey) ?? [];
              return (
                <div
                  key={dayKey}
                  className={cn(
                    "relative min-h-[4rem] rounded-lg border p-1 text-sm transition-colors",
                    isSameMonth(day, currentDate) ? "bg-card" : "bg-muted/50 text-muted-foreground",
                    isToday(day) && "border-primary ring-1 ring-primary",
                  )}
                >
                  <span className={cn("font-medium", isToday(day) && "text-primary")}>
                    {format(day, "d")}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          categories.find((c) => c.value === event.category)?.color || "bg-muted",
                        )}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-semibold">Próximos eventos</h3>
        {data.length === 0 && <p className="text-sm text-muted-foreground">No hay eventos programados.</p>}
        {data.slice(0, 10).map((event) => {
          const isOwner = event.created_by === currentUserId;
          const fromGoogle = event.source === "google_calendar";
          return (
            <Card key={event.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="flex items-center gap-2 font-medium">
                    {event.title}
                    {event.is_public ? (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Users className="h-3 w-3" /> Hogar
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Lock className="h-3 w-3" /> Privado
                      </Badge>
                    )}
                    {fromGoogle && (
                      <Badge variant="outline" className="text-xs">Google</Badge>
                    )}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(parseISO(event.start_at), "dd/MM/yyyy HH:mm", { locale: es })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={categories.find((c) => c.value === event.category)?.color || "bg-muted"}
                  >
                    {categories.find((c) => c.value === event.category)?.label || "Otro"}
                  </Badge>
                  {isOwner && (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Switch
                        checked={!!event.is_public}
                        onCheckedChange={async (checked) => {
                          try {
                            await doTogglePublic({ data: { id: event.id, is_public: checked } });
                            refresh();
                          } catch (e: any) {
                            toast.error(e?.message || "Error");
                          }
                        }}
                      />
                      Compartir
                    </label>
                  )}
                  {isOwner && (
                    <button
                      onClick={async () => {
                        const snapshot = { ...event };
                        await doDelete({ data: { id: event.id } });
                        refresh();
                        undoableToast({
                          message: `Evento "${event.title}" eliminado`,
                          undo: async () => {
                            await doRestore({ data: { row: snapshot } });
                            refresh();
                          },
                        });
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      ×
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo evento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {categories.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-3 rounded-lg border p-3">
              <label className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Compartir con el hogar
                  <span className="text-xs text-muted-foreground">(si no, solo tú lo verás)</span>
                </span>
                <Switch checked={isPublic} onCheckedChange={setIsPublic} />
              </label>
              <label
                className={cn(
                  "flex items-center justify-between gap-3 text-sm",
                  !gStatus?.connected && "opacity-50",
                )}
              >
                <span className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Publicar en Google Calendar
                  {!gStatus?.connected && (
                    <Link to="/settings/google-calendar" className="text-xs text-primary underline">
                      Conectar
                    </Link>
                  )}
                </span>
                <Switch
                  checked={pushToGoogle && !!gStatus?.connected}
                  onCheckedChange={setPushToGoogle}
                  disabled={!gStatus?.connected}
                />
              </label>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !title.trim()} className="w-full">
                {submitting ? "Añadiendo..." : "Añadir evento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
