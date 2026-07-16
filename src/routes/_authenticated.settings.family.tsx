import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { Users, Copy, Plus, UserPlus } from "lucide-react";

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
import { useServerFn } from "@tanstack/react-start";
import { getHousehold, createInvite, joinHousehold } from "@/lib/household.functions";
import { toast } from "sonner";

const householdQueryOptions = queryOptions({
  queryKey: ["household"],
  queryFn: () => getHousehold(),
});

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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState("");
  const [role, setRole] = useState("member");
  const [submitting, setSubmitting] = useState(false);

  const doCreateInvite = useServerFn(createInvite);
  const doJoin = useServerFn(joinHousehold);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["household"] });

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const invite = await doCreateInvite({ data: { role: role as any } });
      toast.success(`Código creado: ${invite.code}`);
      navigator.clipboard.writeText(invite.code);
      refresh();
      setInviteOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al crear invitación");
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      await doJoin({ data: { code: code.trim() } });
      toast.success("Te has unido al hogar");
      refresh();
      setJoinOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Código inválido");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Familia</h2>
        <p className="text-muted-foreground">Gestiona los miembros de tu hogar</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{data.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.household_members.map((member: any) => (
            <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium">{member.display_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.is_child ? "Perfil infantil" : "Miembro adulto"}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">
                {data.user_roles.find((r: any) => r.user_id === member.user_id)?.role || "member"}
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

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear invitación</DialogTitle>
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
            <DialogFooter>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Creando..." : "Generar código"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unirse a un hogar</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleJoin} className="space-y-4">
            <div className="space-y-2">
              <Label>Código de invitación</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCDEFGH" />
            </div>
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
