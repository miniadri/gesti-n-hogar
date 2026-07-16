import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft, Plus, Trash2, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  listAppliances,
  createAppliance,
  deleteAppliance,
  updateAppliance,
  APPLIANCE_LABELS,
  APPLIANCE_TYPES,
  type ApplianceType,
} from "@/lib/appliances.functions";

const qo = queryOptions({ queryKey: ["appliances"], queryFn: () => listAppliances() });

export const Route = createFileRoute("/_authenticated/settings/appliances")({
  loader: ({ context }) => context.queryClient.ensureQueryData(qo),
  head: () => ({ meta: [{ title: "Electrodomésticos - HomeSync" }] }),
  component: AppliancesPage,
});

function AppliancesPage() {
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(qo);
  const [open, setOpen] = useState(false);
  const doDelete = useServerFn(deleteAppliance);
  const doUpdate = useServerFn(updateAppliance);
  const refresh = () => qc.invalidateQueries({ queryKey: ["appliances"] });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/settings/localization">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Electrodomésticos</h2>
            <p className="text-muted-foreground">
              Configura los tuyos para ajustar los tiempos de las recetas.
            </p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {data.map((a: any) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">
                  {APPLIANCE_LABELS[a.type as ApplianceType]}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  title={a.is_default ? "Por defecto" : "Marcar por defecto"}
                  onClick={async () => {
                    await doUpdate({ data: { id: a.id, is_default: true } });
                    refresh();
                  }}
                >
                  <Star className={a.is_default ? "h-4 w-4 fill-current text-primary" : "h-4 w-4"} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    await doDelete({ data: { id: a.id } });
                    refresh();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no has añadido ninguno.</p>
        )}
      </div>

      {open && (
        <AddDialog
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function AddDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<ApplianceType>("induccion");
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const doCreate = useServerFn(createAppliance);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await doCreate({ data: { type, name: name.trim(), is_default: isDefault } });
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo electrodoméstico</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as ApplianceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {APPLIANCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {APPLIANCE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Inducción cocina" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Marcar como principal
          </label>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving || !name.trim()}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
