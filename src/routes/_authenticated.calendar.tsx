import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Calendar as CalendarIcon, Clock, Users, Lock, Settings } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO } from "date-fns";
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

const categories = [
  { value: "family", label: "Familiar", color: "bg-chart-1" },
  { value: "medical", label: "Médico", color: "bg-chart-4" },
  { value: "school", label: "Escuela", color: "bg-chart-2" },
  { value: "work", label: "Trabajo", color: "bg-chart-5" },
  { value: "other", label: "Otro", color: "bg-muted" },
];

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
        {data.slice(0, 10).map((event) => (
          <Card key={event.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{event.title}</p>
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
              </div>
            </CardContent>
          </Card>
        ))}
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
