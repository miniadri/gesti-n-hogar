import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listPreferences, savePreference } from "@/lib/family-features.functions";
import { PreferenceBlocks, preferenceLabels } from "@/lib/family-features";
import { RecipientPicker, usePersonalContext, type PersonalContext } from "./PersonalContext";

type Preference = Awaited<ReturnType<typeof listPreferences>>[number];

export function PreferencesPanel() {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil y preferencias</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Tallas, comidas, estilos y aficiones. Cada persona edita su perfil y elige qué compartir;
          ser administrador no da acceso a bloques privados.
        </p>
        <Button variant="outline" onClick={() => setOpen(!open)}>
          {open ? "Cerrar preferencias" : "Mi perfil y preferencias del hogar"}
        </Button>
        {open && <PreferencesContent />}
      </CardContent>
    </Card>
  );
}

function PreferencesContent() {
  const { data: context, error, isPending } = usePersonalContext();
  if (isPending) return <p role="status">Cargando perfil…</p>;
  if (error || !context)
    return <p role="alert">{error?.message || "No se pudo cargar el perfil"}</p>;
  return <PreferenceList key={`${context.userId}:${context.householdId}`} context={context} />;
}

function PreferenceList({ context }: { context: PersonalContext }) {
  const getPreferences = useServerFn(listPreferences);
  const queryClient = useQueryClient();
  const key = ["personal-preferences", context.userId, context.householdId];
  const {
    data: rows,
    error,
    isPending,
    refetch,
  } = useQuery({
    queryKey: key,
    queryFn: () => getPreferences(),
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  if (isPending) return <p role="status">Cargando preferencias…</p>;
  if (error)
    return (
      <div role="alert">
        <p>No se han podido leer las preferencias: {error.message}</p>
        <Button onClick={() => refetch()}>Reintentar</Button>
      </div>
    );
  const own = (rows ?? []).filter((row) => row.owner_user_id === context.userId);
  return (
    <div className="space-y-5">
      <p className="rounded-md bg-muted p-3 text-sm">
        Se guardan únicamente los textos de estos bloques en el servidor. Vaciar un bloque y
        guardarlo como privado retira su información compartida. No incluyas contraseñas ni datos
        sanitarios.
      </p>
      {PreferenceBlocks.map((block) => {
        const row = own.find((value) => value.block === block);
        return (
          <PreferenceEditor
            key={`${block}:${row?.revision ?? 0}`}
            block={block}
            row={row}
            context={context}
            onSaved={() => queryClient.invalidateQueries({ queryKey: key })}
          />
        );
      })}
      <h3 className="font-semibold">Preferencias que otros miembros comparten contigo</h3>
      {(rows ?? [])
        .filter((row) => row.owner_user_id !== context.userId)
        .map((row) => (
          <section key={`${row.owner_user_id}:${row.block}`} className="rounded-md border p-3">
            <h4 className="font-medium">
              {context.members.find((member) => member.user_id === row.owner_user_id)
                ?.display_name ?? "Miembro"}{" "}
              · {preferenceLabels[row.block as (typeof PreferenceBlocks)[number]]}
            </h4>
            <p className="whitespace-pre-wrap break-words text-sm">
              {row.details || "Sin información"}
            </p>
          </section>
        ))}
      {!(rows ?? []).some((row) => row.owner_user_id !== context.userId) && (
        <p className="text-sm text-muted-foreground">Todavía no hay bloques compartidos contigo.</p>
      )}
    </div>
  );
}

function PreferenceEditor({
  block,
  row,
  context,
  onSaved,
}: {
  block: (typeof PreferenceBlocks)[number];
  row?: Preference;
  context: PersonalContext;
  onSaved: () => Promise<unknown>;
}) {
  const [details, setDetails] = useState(row?.details ?? "");
  const [visibility, setVisibility] = useState<"private" | "selected" | "household">(
    (row?.visibility ?? "private") as "private" | "selected" | "household",
  );
  const [recipients, setRecipients] = useState(row?.recipients ?? []);
  const [saving, setSaving] = useState(false);
  const save = useServerFn(savePreference);
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await save({
            data: { block, details, visibility, recipients, revision: row?.revision ?? 0 },
          });
          await onSaved();
          toast.success("Preferencias guardadas");
        } catch (error: any) {
          toast.error(error.message || "No se pudo guardar");
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="block space-y-2">
        <span className="font-medium">{preferenceLabels[block]}</span>
        <Textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={2000}
          rows={3}
          placeholder={
            block === "sizes"
              ? "Camiseta M, pantalón 40, calzado 39…"
              : "Escribe lo que quieras que recuerden de ti…"
          }
        />
      </label>
      <Select
        value={visibility}
        onValueChange={(value) => setVisibility(value as typeof visibility)}
      >
        <SelectTrigger aria-label="Privacidad del bloque">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="private">Solo yo</SelectItem>
          <SelectItem value="selected">Personas elegidas</SelectItem>
          <SelectItem value="household">Todo el hogar con cuenta individual</SelectItem>
        </SelectContent>
      </Select>
      {visibility === "selected" && (
        <RecipientPicker context={context} selected={recipients} onChange={setRecipients} />
      )}
      <Button type="submit" disabled={saving || (visibility === "selected" && !recipients.length)}>
        {saving ? "Guardando…" : "Guardar bloque"}
      </Button>
    </form>
  );
}
