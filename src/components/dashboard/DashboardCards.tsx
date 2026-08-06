import type { ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { Calendar, CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dateKey, formatTime, slotCrossesMidnight } from "@/lib/dashboard-utils";

export function EventGroup({ label, events }: { label: string; events: any[] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="space-y-2">
        {events.slice(0, 5).map((event) => {
          const start = new Date(event.start_at);
          return (
            <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{event.title}</p>
                <p className="text-xs text-muted-foreground">
                  {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {event.category ? ` · ${event.category}` : ""}
                </p>
              </div>
              <Badge variant="outline">{event.source === "google" ? "Google" : "App"}</Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarTodayTomorrowCard({ today, tomorrow }: { today: any[]; tomorrow: any[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-primary" />
          Calendario
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/calendar">Ver calendario</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {today.length > 0 && <EventGroup label="Hoy" events={today} />}
        {tomorrow.length > 0 && <EventGroup label="Mañana" events={tomorrow} />}
      </CardContent>
    </Card>
  );
}

export function ScheduleTodayTomorrowCard({ days }: { days: any[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4 text-primary" />
          Cuadrante
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/calendar/schedule">Ver cuadrante</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {days.map((day) => (
          <div key={dateKey(day.date)}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{day.label}</p>
            <div className="space-y-2">
              {day.slots.map((slot: any, index: number) => (
                <div key={`${slot.id}-${index}-${day.label}`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {slot.carried
                          ? `00:00-${formatTime(slot.end_time)}`
                          : `${formatTime(slot.start_time)}-${formatTime(slot.end_time)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {slot.memberName}
                        {" · "}
                        {slot.carried
                          ? "Viene del día anterior"
                          : slotCrossesMidnight(slot)
                            ? "Cruza medianoche"
                            : slot.label || "Turno programado"}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {slot.slot_kind === "subject"
                        ? "Clase"
                        : slot.slot_kind === "extracurricular"
                          ? "Extraescolar"
                          : "Turno"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SummaryCard({
  title,
  value,
  icon: Icon,
  href,
  color,
}: {
  title: string;
  value: string | number;
  icon: ComponentType<{ className?: string }>;
  href: string;
  color: string;
}) {
  return (
    <Link to={href} className="block h-full">
      <Card className="h-full transition-colors hover:bg-accent/50">
        <CardContent className="flex h-full items-center gap-4 p-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary">
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
