import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Calendar as CalendarIcon,
  CalendarDays,
  Clock,
  Users,
  Lock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Palette,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  parseISO,
  addMonths,
  subMonths,
  subDays,
} from "date-fns";
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
import {
  listEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  restoreEvent,
  togglePublicEvent,
} from "@/lib/calendar.functions";
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

type Category = { value: string; label: string; color: string };

const DEFAULT_CATEGORIES: Category[] = [
  { value: "family", label: "Familiar", color: "#3b82f6" },
  { value: "medical", label: "Médico", color: "#ef4444" },
  { value: "school", label: "Escuela", color: "#f59e0b" },
  { value: "work", label: "Trabajo", color: "#8b5cf6" },
  { value: "birthday", label: "Cumpleaños", color: "#ec4899" },
  { value: "other", label: "Otro", color: "#64748b" },
];

const CATEGORIES_STORAGE_KEY = "homesync.calendar.categories";
const COLOR_STORAGE_KEY = "homesync.calendar.categoryColors"; // legacy
const PAST_EVENTS_DAYS = 7;
const PALETTE = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#0ea5e9",
  "#a855f7",
  "#eab308",
];

function loadCategories(): Category[] {
  if (typeof window === "undefined") return DEFAULT_CATEGORIES;
  try {
    const raw = window.localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
    // Migrate legacy color-only map
    const legacy = window.localStorage.getItem(COLOR_STORAGE_KEY);
    if (legacy) {
      const map = JSON.parse(legacy) as Record<string, string>;
      return DEFAULT_CATEGORIES.map((c) => ({ ...c, color: map[c.value] ?? c.color }));
    }
    return DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || `cat_${Date.now()}`
  );
}

function CalendarPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
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
  const [categoriesList, setCategoriesList] = useState<Category[]>(() => loadCategories());
  const [colorsOpen, setColorsOpen] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState("");
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("12:00");
  const [editCategory, setEditCategory] = useState("other");
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categoriesList));
    } catch {}
  }, [categoriesList]);

  const catMap = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categoriesList) m.set(c.value, c);
    return m;
  }, [categoriesList]);

  const colorFor = (value?: string | null) =>
    catMap.get(value ?? "other")?.color ?? catMap.get("other")?.color ?? "#64748b";
  const labelFor = (value?: string | null) => catMap.get(value ?? "other")?.label ?? "Otro";

  const updateCategory = (value: string, patch: Partial<Category>) =>
    setCategoriesList((prev) => prev.map((c) => (c.value === value ? { ...c, ...patch } : c)));

  const addCategory = () => {
    const label = newCatLabel.trim();
    if (!label) return;
    let value = slugify(label);
    if (catMap.has(value)) value = `${value}_${Date.now().toString(36).slice(-4)}`;
    setCategoriesList((prev) => [
      ...prev,
      { value, label, color: PALETTE[prev.length % PALETTE.length] },
    ]);
    setNewCatLabel("");
  };

  const removeCategory = (value: string) => {
    if (value === "other") {
      toast.error("La categoría 'Otro' no se puede eliminar");
      return;
    }
    setCategoriesList((prev) => prev.filter((c) => c.value !== value));
  };

  const doCreate = useServerFn(createEvent);
  const doUpdate = useServerFn(updateEvent);
  const doDelete = useServerFn(deleteEvent);
  const doRestore = useServerFn(restoreEvent);
  const doTogglePublic = useServerFn(togglePublicEvent);
  const getGStatus = useServerFn(getGoogleCalendarStatus);

  const { data: gStatus } = useQuery({
    queryKey: ["google-calendar-status"],
    queryFn: () => getGStatus(),
  });

  if (pathname === "/calendar/schedule") {
    return <Outlet />;
  }

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

  // Upcoming: future events + past ones within last 7 days
  const cutoff = subDays(new Date(), PAST_EVENTS_DAYS);
  const upcoming = [...data]
    .filter((e) => parseISO(e.start_at) >= cutoff)
    .sort((a, b) => parseISO(a.start_at).getTime() - parseISO(b.start_at).getTime());

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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate((d) => subMonths(d, 1))}
            title="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentDate((d) => addMonths(d, 1))}
            title="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
            Hoy
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setColorsOpen(true)}
            title="Categorías"
          >
            <Palette className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" asChild title="Google Calendar">
            <Link to="/settings/google-calendar">
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild title="Cuadrante laboral/escolar">
            <Link to="/calendar/schedule">
              <CalendarDays className="mr-2 h-4 w-4" />
              Cuadrante
            </Link>
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Evento
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {categoriesList.map((c) => (
          <div key={c.value} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full ring-1 ring-border"
              style={{ background: c.color }}
            />
            <span className="text-muted-foreground">{c.label}</span>
          </div>
        ))}
        <div className="ml-2 flex items-center gap-3 border-l pl-3">
          <span className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" /> Compartido
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Lock className="h-3 w-3" /> Privado
          </span>
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
                  <div className="mt-1 flex flex-wrap gap-1">
                    {dayEvents.slice(0, 4).map((event) => (
                      <div
                        key={event.id}
                        title={`${event.title}${event.is_public ? " (compartido)" : " (privado)"}`}
                        className="flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-background shadow-sm"
                        style={{ background: colorFor(event.category) }}
                      >
                        {event.is_public && (
                          <Users className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                        )}
                      </div>
                    ))}
                    {dayEvents.length > 4 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{dayEvents.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">Próximos eventos</h3>
          <span className="text-xs text-muted-foreground">
            Se muestran eventos pasados hasta {PAST_EVENTS_DAYS} días atrás
          </span>
        </div>
        {upcoming.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay eventos programados.</p>
        )}
        {upcoming.slice(0, 10).map((event) => {
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
                      <Badge variant="outline" className="text-xs">
                        Google
                      </Badge>
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
                    className="border-transparent text-white"
                    style={{ background: colorFor(event.category) }}
                  >
                    {labelFor(event.category)}
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
                      onClick={() => {
                        const d = parseISO(event.start_at);
                        setEditingEvent(event);
                        setEditTitle(event.title);
                        setEditDate(format(d, "yyyy-MM-dd"));
                        setEditTime(format(d, "HH:mm"));
                        setEditCategory(event.category ?? "other");
                      }}
                      className="text-muted-foreground hover:text-primary"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
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
                {categoriesList.map((c) => (
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

      <Dialog open={colorsOpen} onOpenChange={setColorsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Categorías</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {categoriesList.map((c) => (
              <div key={c.value} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-4 w-4 shrink-0 rounded-full ring-1 ring-border"
                    style={{ background: c.color }}
                  />
                  <Input
                    value={c.label}
                    onChange={(e) => updateCategory(c.value, { label: e.target.value })}
                    className="h-8"
                  />
                  <input
                    type="color"
                    value={c.color}
                    onChange={(e) => updateCategory(c.value, { color: e.target.value })}
                    className="h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => removeCategory(c.value)}
                    disabled={c.value === "other"}
                    className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    title={c.value === "other" ? "No se puede eliminar" : "Eliminar categoría"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PALETTE.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => updateCategory(c.value, { color: hex })}
                      className={cn(
                        "h-5 w-5 rounded-full ring-1 ring-border transition-transform hover:scale-110",
                        c.color.toLowerCase() === hex.toLowerCase() && "ring-2 ring-primary",
                      )}
                      style={{ background: hex }}
                      aria-label={hex}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-3">
              <Input
                placeholder="Nueva categoría (ej. Deporte)"
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCategory();
                  }
                }}
                className="h-8"
              />
              <Button size="sm" onClick={addCategory} disabled={!newCatLabel.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoriesList(DEFAULT_CATEGORIES)}>
              Restablecer
            </Button>
            <Button onClick={() => setColorsOpen(false)}>Listo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingEvent} onOpenChange={(o) => !o && setEditingEvent(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar evento</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!editingEvent || !editTitle.trim() || !editDate) return;
              setEditSubmitting(true);
              try {
                const start = new Date(`${editDate}T${editTime}`).toISOString();
                await doUpdate({
                  data: {
                    id: editingEvent.id,
                    title: editTitle.trim(),
                    start_at: start,
                    category: editCategory,
                  },
                });
                toast.success("Evento actualizado");
                setEditingEvent(null);
                refresh();
              } catch (err: any) {
                toast.error(err.message || "Error al actualizar");
              } finally {
                setEditSubmitting(false);
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hora</Label>
                <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoría</Label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                {categoriesList.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingEvent(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editSubmitting || !editTitle.trim()}>
                {editSubmitting ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
