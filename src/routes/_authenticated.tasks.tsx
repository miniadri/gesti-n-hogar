import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Check, Trash2, Calendar } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useServerFn } from "@tanstack/react-start";
import { listTasks, createTask, updateTask, deleteTask } from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const tasksQueryOptions = queryOptions({
  queryKey: ["tasks"],
  queryFn: () => listTasks(),
});

export const Route = createFileRoute("/_authenticated/tasks")({
  loader: ({ context }) => context.queryClient.ensureQueryData(tasksQueryOptions),
  head: () => ({
    meta: [{ title: "Tareas - HomeSync" }],
  }),
  component: TasksPage,
});

const priorities = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
];

function TasksPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(tasksQueryOptions);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const doCreate = useServerFn(createTask);
  const doUpdate = useServerFn(updateTask);
  const doDelete = useServerFn(deleteTask);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await doCreate({
        data: {
          title: title.trim(),
          priority: priority as any,
          due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        },
      });
      toast.success("Tarea añadida");
      setTitle("");
      setDueDate("");
      refresh();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir tarea");
    } finally {
      setSubmitting(false);
    }
  };

  const pending = data.filter((t) => t.status !== "done" && t.status !== "cancelled");
  const done = data.filter((t) => t.status === "done");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tareas del hogar</h2>
          <p className="text-muted-foreground">Organiza las tareas entre los miembros</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva tarea
        </Button>
      </div>

      <div className="space-y-3">
        {pending.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay tareas pendientes.</p>
        )}
        {pending.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onToggle={async () => {
              await doUpdate({ data: { id: task.id, status: "done" } });
              refresh();
            }}
            onDelete={async () => {
              await doDelete({ data: { id: task.id } });
              refresh();
            }}
          />
        ))}
      </div>

      {done.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Completadas</h3>
          {done.map((task) => (
            <TaskCard key={task.id} task={task} done />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha límite</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting || !title.trim()} className="w-full">
                {submitting ? "Añadiendo..." : "Añadir tarea"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskCard({
  task,
  onToggle,
  onDelete,
  done = false,
}: {
  task: any;
  onToggle?: () => void;
  onDelete?: () => void;
  done?: boolean;
}) {
  const priorityColor =
    task.priority === "high" ? "bg-destructive/10 text-destructive" : task.priority === "medium" ? "bg-chart-3/20 text-chart-3" : "bg-muted text-muted-foreground";

  return (
    <Card className={cn("transition-opacity", done && "opacity-60")}>
      <CardContent className="flex items-center gap-3 p-4">
        {onToggle && (
          <button
            onClick={onToggle}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-muted-foreground/30 transition-colors hover:border-primary"
          >
            <Check className="h-3.5 w-3.5 opacity-0 hover:opacity-100" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("font-medium", done && "line-through")}>{task.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {task.due_date && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(task.due_date).toLocaleDateString("es-ES")}
              </span>
            )}
            {task.category && <Badge variant="outline">{task.category}</Badge>}
          </div>
        </div>
        <Badge variant="secondary" className={priorityColor}>
          {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Media" : "Baja"}
        </Badge>
        {onDelete && (
          <button onClick={onDelete} className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}
