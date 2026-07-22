import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, Check, Trash2, Calendar, Repeat, ListChecks, Image as ImageIcon, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { listTasks, createTask, updateTask, deleteTask, restoreTask, getTaskPhotoUrl } from "@/lib/tasks.functions";
import { undoableToast } from "@/hooks/use-undoable";
import { getHousehold } from "@/lib/household.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const tasksQueryOptions = queryOptions({
  queryKey: ["tasks"],
  queryFn: () => listTasks(),
});

const householdQueryOptions = queryOptions({
  queryKey: ["household"],
  queryFn: () => getHousehold(),
});

export const Route = createFileRoute("/_authenticated/tasks")({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(tasksQueryOptions),
      context.queryClient.ensureQueryData(householdQueryOptions),
    ]),
  head: () => ({ meta: [{ title: "Tareas - HomeSync" }] }),
  component: TasksPage,
});

const priorities = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
];

type ChecklistItem = { text: string; done: boolean };

function TasksPage() {
  const queryClient = useQueryClient();
  const { data: tasks } = useSuspenseQuery(tasksQueryOptions);
  const { data: household } = useSuspenseQuery(householdQueryOptions);
  const members = (household?.household_members ?? []) as Array<{ id: string; display_name: string; is_child: boolean }>;

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [assignMode, setAssignMode] = useState<"none" | "manual" | "random">("none");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [childAllowed, setChildAllowed] = useState(false);
  const [recurrenceOn, setRecurrenceOn] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState<number>(7);
  const [taskType, setTaskType] = useState<"text" | "checklist">("text");
  const [checklist, setChecklist] = useState<ChecklistItem[]>([{ text: "", done: false }]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const doCreate = useServerFn(createTask);
  const doUpdate = useServerFn(updateTask);
  const doDelete = useServerFn(deleteTask);
  const doRestore = useServerFn(restoreTask);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["tasks"] });

  const resetForm = () => {
    setTitle(""); setDueDate(""); setPriority("medium");
    setAssignMode("none"); setAssignedTo(""); setChildAllowed(false);
    setRecurrenceOn(false); setRecurrenceDays(7);
    setTaskType("text"); setChecklist([{ text: "", done: false }]);
    setPhotoFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      let photo_path: string | null = null;
      if (photoFile) {
        const hhId = household!.id;
        const ext = photoFile.name.split(".").pop() || "jpg";
        const path = `${hhId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("task-photos")
          .upload(path, photoFile, { contentType: photoFile.type });
        if (upErr) throw upErr;
        photo_path = path;
      }

      const cleanedChecklist =
        taskType === "checklist"
          ? checklist.map((c) => ({ text: c.text.trim(), done: false })).filter((c) => c.text)
          : null;

      await doCreate({
        data: {
          title: title.trim(),
          priority: priority as any,
          due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
          assigned_to: assignMode === "manual" && assignedTo ? assignedTo : null,
          assign_random: assignMode === "random",
          child_allowed: childAllowed,
          recurrence_days: recurrenceOn ? recurrenceDays : null,
          checklist: cleanedChecklist,
          photo_path,
        },
      });
      toast.success("Tarea añadida");
      resetForm();
      refresh();
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al añadir tarea");
    } finally {
      setSubmitting(false);
    }
  };

  const pending = tasks.filter((t: any) => t.status !== "done" && t.status !== "cancelled");
  const done = tasks.filter((t: any) => t.status === "done");

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
        {pending.map((task: any) => (
          <TaskCard
            key={task.id}
            task={task}
            onToggle={async () => {
              await doUpdate({ data: { id: task.id, status: "done" } });
              refresh();
            }}
            onChecklistChange={async (next) => {
              await doUpdate({ data: { id: task.id, checklist: next } });
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
          {done.map((task: any) => (
            <TaskCard key={task.id} task={task} done />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva tarea</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>

            {/* Tipo de tarea */}
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={taskType} onValueChange={(v) => setTaskType(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto simple</SelectItem>
                  <SelectItem value="checklist">Lista de casillas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {taskType === "checklist" && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2"><ListChecks className="h-4 w-4" /> Elementos</Label>
                <div className="space-y-2">
                  {checklist.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={item.text}
                        placeholder={`Elemento ${i + 1}`}
                        onChange={(e) => {
                          const next = [...checklist];
                          next[i] = { ...next[i], text: e.target.value };
                          setChecklist(next);
                        }}
                      />
                      <Button type="button" variant="ghost" size="icon"
                        onClick={() => setChecklist(checklist.filter((_, idx) => idx !== i))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setChecklist([...checklist, { text: "", done: false }])}>
                    <Plus className="mr-1 h-3 w-3" /> Añadir elemento
                  </Button>
                </div>
              </div>
            )}

            {/* Asignación */}
            <div className="space-y-2">
              <Label>Asignar a</Label>
              <Select value={assignMode} onValueChange={(v) => setAssignMode(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  <SelectItem value="manual">Elegir persona</SelectItem>
                  <SelectItem value="random">Al azar</SelectItem>
                </SelectContent>
              </Select>
              {assignMode === "manual" && (
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue placeholder="Selecciona miembro" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.display_name} {m.is_child ? "(infantil)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {(assignMode === "random" || assignMode === "manual") && (
                <div className="flex items-center justify-between rounded-md border p-2">
                  <span className="text-sm">Puede realizarla un niño</span>
                  <Switch checked={childAllowed} onCheckedChange={setChildAllowed} />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorities.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha límite</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>

            {/* Recurrencia */}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2"><Repeat className="h-4 w-4" /> Repetir en el tiempo</Label>
                <Switch checked={recurrenceOn} onCheckedChange={setRecurrenceOn} />
              </div>
              {recurrenceOn && (
                <div className="flex items-center gap-2 text-sm">
                  <span>Cada</span>
                  <Input
                    type="number" min={1} max={365}
                    className="w-20"
                    value={recurrenceDays}
                    onChange={(e) => setRecurrenceDays(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <span>día(s)</span>
                </div>
              )}
            </div>

            {/* Foto opcional */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><ImageIcon className="h-4 w-4" /> Foto (opcional)</Label>
              <Input type="file" accept="image/*"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
              {photoFile && <p className="text-xs text-muted-foreground">{photoFile.name}</p>}
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
  onChecklistChange,
  done = false,
}: {
  task: any;
  onToggle?: () => void;
  onDelete?: () => void;
  onChecklistChange?: (next: ChecklistItem[]) => void;
  done?: boolean;
}) {
  const priorityColor =
    task.priority === "high"
      ? "bg-destructive/10 text-destructive"
      : task.priority === "medium"
      ? "bg-chart-3/20 text-chart-3"
      : "bg-muted text-muted-foreground";

  const doGetPhoto = useServerFn(getTaskPhotoUrl);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (task.photo_path) {
      doGetPhoto({ data: { path: task.photo_path } })
        .then((r: any) => setPhotoUrl(r?.signedUrl ?? null))
        .catch(() => {});
    }
  }, [task.photo_path]);

  const checklist: ChecklistItem[] | null = Array.isArray(task.checklist) ? task.checklist : null;

  return (
    <Card className={cn("transition-opacity", done && "opacity-60")}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {onToggle && (
            <button
              onClick={onToggle}
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 border-muted-foreground/30 transition-colors hover:border-primary"
            >
              <Check className="h-3.5 w-3.5 opacity-0 hover:opacity-100" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className={cn("font-medium", done && "line-through")}>{task.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {task.assignee && (
                <span>👤 {task.assignee.display_name}</span>
              )}
              {task.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(task.due_date).toLocaleDateString("es-ES")}
                </span>
              )}
              {task.recurrence_days && (
                <span className="flex items-center gap-1">
                  <Repeat className="h-3 w-3" /> cada {task.recurrence_days}d
                </span>
              )}
              {task.child_allowed && <Badge variant="outline">Apto niños</Badge>}
              {task.category && <Badge variant="outline">{task.category}</Badge>}
            </div>

            {checklist && checklist.length > 0 && (
              <ul className="mt-3 space-y-1">
                {checklist.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={c.done}
                      disabled={!onChecklistChange}
                      onCheckedChange={(v) => {
                        if (!onChecklistChange) return;
                        const next = checklist.map((it, idx) =>
                          idx === i ? { ...it, done: !!v } : it,
                        );
                        onChecklistChange(next);
                      }}
                    />
                    <span className={cn(c.done && "line-through text-muted-foreground")}>{c.text}</span>
                  </li>
                ))}
              </ul>
            )}

            {photoUrl && (
              <img src={photoUrl} alt="" className="mt-3 max-h-48 rounded-md object-cover" />
            )}
          </div>
          <Badge variant="secondary" className={priorityColor}>
            {task.priority === "high" ? "Alta" : task.priority === "medium" ? "Media" : "Baja"}
          </Badge>
          {onDelete && (
            <button onClick={onDelete} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
