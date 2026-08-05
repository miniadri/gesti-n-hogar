import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Copy, Plus, UserPlus, Pencil, Check, X, QrCode, Trash2, Camera } from "lucide-react";

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarcodeDisplay } from "@/components/BarcodeDisplay";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useServerFn } from "@tanstack/react-start";
import { getHousehold, createInvite, joinHousehold, createChildMember, updateHousehold, renameMember, listInvites, deleteInvite } from "@/lib/household.functions";
import { toast } from "sonner";

const householdQueryOptions = queryOptions({
  queryKey: ["household"],
  queryFn: () => getHousehold(),
});

const invitesQueryOptions = queryOptions({
  queryKey: ["household-invites"],
  queryFn: () => listInvites(),
});

const roleLabels: Record<string, string> = {
  admin: "Admin",
  member: "Miembro",
  child: "Infantil",
};


export const Route = createFileRoute("/_authenticated/settings/family")({
  loader: ({ context }) => context.queryClient.ensureQueryData(householdQueryOptions),
  head: () => ({
    meta: [{ title: "Familia - HomeSync" }],
  }),
  component: FamilySettingsPage,
});

function FamilySettingsPage() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(householdQueryOptions);
  const invites = useQuery(invitesQueryOptions);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState("");
  const [role, setRole] = useState("member");
  const [childMode, setChildMode] = useState<"manual" | "code">("manual");
  const [childName, setChildName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [householdName, setHouseholdName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const doCreateInvite = useServerFn(createInvite);
  const doJoin = useServerFn(joinHousehold);
  const doCreateChild = useServerFn(createChildMember);
  const doUpdateHousehold = useServerFn(updateHousehold);
  const doRenameMember = useServerFn(renameMember);
  const doDeleteInvite = useServerFn(deleteInvite);


  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberName, setMemberName] = useState("");
  const [savingMember, setSavingMember] = useState(false);

  const startEditMember = (m: any) => {
    setEditingMemberId(m.id);
    setMemberName(m.display_name);
  };
  const saveMember = async (id: string, original: string) => {
    const name = memberName.trim();
    if (!name || name === original) {
      setEditingMemberId(null);
      return;
    }
    setSavingMember(true);
    try {
      await doRenameMember({ data: { member_id: id, display_name: name } });
      toast.success("Nombre actualizado");
      refresh();
      setEditingMemberId(null);
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar");
    } finally {
      setSavingMember(false);
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["household"] });
    queryClient.invalidateQueries({ queryKey: ["household-invites"] });
  };


  const startEditName = () => {
    setHouseholdName(data.name);
    setEditingName(true);
  };
  const saveName = async () => {
    const name = householdName.trim();
    if (!name || name === data.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await doUpdateHousehold({ data: { name } });
      toast.success("Nombre del hogar actualizado");
      refresh();
      setEditingName(false);
    } catch (err: any) {
      toast.error(err.message || "No se pudo actualizar");
    } finally {
      setSavingName(false);
    }
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (role === "child" && childMode === "manual") {
        if (!childName.trim()) {
          toast.error("Introduce un nombre para el perfil infantil");
          setSubmitting(false);
          return;
        }
        await doCreateChild({ data: { display_name: childName.trim() } });
        toast.success(`Perfil infantil "${childName.trim()}" añadido`);
        setChildName("");
        refresh();
        setInviteOpen(false);
      } else {
        const invite = await doCreateInvite({ data: { role: role as any } });
        toast.success(`Código creado: ${invite.code}`);
        navigator.clipboard.writeText(invite.code).catch(() => {});
        refresh();
        setInviteOpen(false);
        setQrCode(invite.code);
      }
    } catch (err: any) {
      toast.error(err.message || "Error al crear invitación");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteInvite = async (id: string) => {
    try {
      await doDeleteInvite({ data: { id } });
      refresh();
    } catch (err: any) {
      toast.error(err.message || "No se pudo eliminar");
    }
  };

  const submitJoin = async (raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!value) return;
    setSubmitting(true);
    try {
      await doJoin({ data: { code: value } });
      toast.success("Te has unido al hogar");
      refresh();
      setJoinOpen(false);
      setScanning(false);
      setCode("");
    } catch (err: any) {
      toast.error(err.message || "Código inválido");
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitJoin(code);
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Familia</h2>
        <p className="text-muted-foreground">Gestiona los miembros de tu hogar</p>
      </div>

      <Card>
        <CardHeader>
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                autoFocus
                maxLength={80}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveName(); }
                  if (e.key === "Escape") setEditingName(false);
                }}
              />
              <Button size="icon" variant="ghost" onClick={saveName} disabled={savingName} aria-label="Guardar">
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingName(false)} disabled={savingName} aria-label="Cancelar">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{data.name}</CardTitle>
              <Button size="icon" variant="ghost" onClick={startEditName} aria-label="Renombrar hogar">
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {[...data.household_members]
            .sort((a: any, b: any) => Number(a.is_child) - Number(b.is_child))
            .map((member: any) => (
            <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  {editingMemberId === member.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={memberName}
                        onChange={(e) => setMemberName(e.target.value)}
                        autoFocus
                        maxLength={60}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); saveMember(member.id, member.display_name); }
                          if (e.key === "Escape") setEditingMemberId(null);
                        }}
                      />
                      <Button size="icon" variant="ghost" onClick={() => saveMember(member.id, member.display_name)} disabled={savingMember} aria-label="Guardar">
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingMemberId(null)} disabled={savingMember} aria-label="Cancelar">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{member.display_name}</p>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditMember(member)} aria-label="Renombrar miembro">
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {member.is_child ? "Perfil infantil" : "Miembro adulto"}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">
                {member.is_child
                  ? "infantil"
                  : data.user_roles.find((r: any) => r.user_id === member.user_id)?.role || "member"}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>


      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <UserPlus className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Invitar a un familiar</p>
                <p className="text-sm text-muted-foreground">Genera un código de invitación</p>
              </div>
            </div>
            <Button className="mt-4 w-full" onClick={() => setInviteOpen(true)}>
              Crear invitación
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-primary" />
              <div>
                <p className="font-semibold">Unirse a un hogar</p>
                <p className="text-sm text-muted-foreground">Introduce el código que te han compartido</p>
              </div>
            </div>
            <Button className="mt-4 w-full" variant="outline" onClick={() => setJoinOpen(true)}>
              Unirse
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de invitaciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(invites.data ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Todavía no hay códigos generados.</p>
          )}
          {(invites.data ?? []).map((inv: any) => {
            const expired = !inv.used_at && new Date(inv.expires_at) <= new Date();
            const status = inv.used_at ? "used" : expired ? "expired" : "active";
            return (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-lg font-semibold tracking-widest">{inv.code}</p>
                    <Badge
                      variant={status === "active" ? "default" : status === "used" ? "secondary" : "destructive"}
                    >
                      {status === "active" ? "Activo" : status === "used" ? "Usado" : "Caducado"}
                    </Badge>
                    <Badge variant="outline">{roleLabels[inv.role] ?? inv.role}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inv.used_at
                      ? `Usado el ${new Date(inv.used_at).toLocaleString("es-ES")}`
                      : `${expired ? "Caducó" : "Caduca"} el ${new Date(inv.expires_at).toLocaleString("es-ES")}`}
                  </p>
                  {expired && (
                    <p className="text-xs text-destructive">Genera un código nuevo para invitar.</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Copiar código"
                    onClick={() => {
                      navigator.clipboard.writeText(inv.code).catch(() => {});
                      toast.success("Código copiado");
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Ver QR"
                    disabled={status !== "active"}
                    onClick={() => setQrCode(inv.code)}
                  >
                    <QrCode className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Eliminar código"
                    onClick={() => handleDeleteInvite(inv.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {role === "child" && childMode === "manual" ? "Añadir perfil infantil" : "Crear invitación"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateInvite} className="space-y-4">
            <div className="space-y-2">
              <Label>Rol</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2"
              >
                <option value="member">Miembro</option>
                <option value="admin">Admin</option>
                <option value="child">Infantil</option>
              </select>
            </div>
            {role === "child" && (
              <div className="space-y-2">
                <Label>Cómo añadirlo</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={childMode === "manual" ? "default" : "outline"}
                    onClick={() => setChildMode("manual")}
                  >
                    Manual
                  </Button>
                  <Button
                    type="button"
                    variant={childMode === "code" ? "default" : "outline"}
                    onClick={() => setChildMode("code")}
                  >
                    Con código + QR
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {childMode === "manual"
                    ? "El perfil infantil se añade directamente al hogar, sin código."
                    : "Se genera un código con rol infantil: quien lo use se unirá con las limitaciones de perfil infantil."}
                </p>
              </div>
            )}
            {role === "child" && childMode === "manual" && (
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={childName}
                  onChange={(e) => setChildName(e.target.value)}
                  placeholder="Ej. Lucía"
                  autoFocus
                />
              </div>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={submitting || (role === "child" && childMode === "manual" && !childName.trim())}
                className="w-full"
              >
                {role === "child" && childMode === "manual"
                  ? submitting ? "Añadiendo..." : "Añadir al hogar"
                  : submitting ? "Creando..." : "Generar código"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrCode} onOpenChange={(o) => !o && setQrCode(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Código de invitación</DialogTitle>
          </DialogHeader>
          {qrCode && (
            <div className="space-y-3 text-center">
              <BarcodeDisplay value={qrCode} format="QR" />
              <p className="font-mono text-xl font-semibold tracking-widest">{qrCode}</p>
              <p className="text-sm text-muted-foreground">
                Escanéalo desde "Unirse a un hogar" o introduce el código manualmente.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={joinOpen}
        onOpenChange={(o) => {
          setJoinOpen(o);
          if (!o) setScanning(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unirse a un hogar</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label>Código de invitación</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCDEFGH" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setScanning((s) => !s)}
            >
              <Camera className="mr-2 h-4 w-4" />
              {scanning ? "Cerrar cámara" : "Escanear QR"}
            </Button>
            {scanning && (
              <BarcodeScanner
                active
                paused={submitting}
                onDetected={(value) => {
                  setCode(value.trim().toUpperCase());
                  setScanning(false);
                  submitJoin(value);
                }}
              />
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting || !code.trim()} className="w-full">
                {submitting ? "Uniendo..." : "Unirse"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>

  );
}
