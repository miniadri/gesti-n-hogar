import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gift, Plus, ExternalLink, Trash2, Heart, X, Search, Euro } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  listWishlist,
  createWishlistItem,
  deleteWishlistItem,
  reactToWishlistItem,
  claimWishlistItem,
  updateWishlistClaim,
  releaseWishlistClaim,
} from "@/lib/wishlist.functions";
import { cn } from "@/lib/utils";

type Member = { id: string; display_name: string; is_child: boolean };

type WishItem = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  estimated_price: number | null;
  priority: string;
  status: string;
  recipient_reaction: string;
  for_member_id: string;
  created_by_member_id: string;
};

type Claim = {
  id: string;
  wishlist_item_id: string;
  claimer_member_id: string;
  status: string;
  notes: string | null;
  tracked_price: number | null;
  tracked_store: string | null;
  tracked_url: string | null;
};

const PRIORITIES = [
  { value: "low", label: "Baja" },
  { value: "medium", label: "Media" },
  { value: "high", label: "Alta" },
];

const CLAIM_STATUS = [
  { value: "considering", label: "Pensándolo" },
  { value: "purchased", label: "Comprado" },
  { value: "gifted", label: "Entregado" },
];

const STORES = [
  { value: "Amazon", search: (q: string) => `https://www.amazon.es/s?k=${encodeURIComponent(q)}` },
  { value: "MediaMarkt", search: (q: string) => `https://www.mediamarkt.es/es/search.html?query=${encodeURIComponent(q)}` },
  { value: "PcComponentes", search: (q: string) => `https://www.pccomponentes.com/buscar/?query=${encodeURIComponent(q)}` },
  { value: "El Corte Inglés", search: (q: string) => `https://www.elcorteingles.es/search/?s=${encodeURIComponent(q)}` },
  { value: "Google Shopping", search: (q: string) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}` },
];

export function WishlistPanel({ members }: { members: Member[] }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => listWishlist(),
  });

  const doCreate = useServerFn(createWishlistItem);
  const doDelete = useServerFn(deleteWishlistItem);
  const doReact = useServerFn(reactToWishlistItem);
  const doClaim = useServerFn(claimWishlistItem);
  const doUpdateClaim = useServerFn(updateWishlistClaim);
  const doRelease = useServerFn(releaseWishlistClaim);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["wishlist"] });

  const me = data?.me as Member | undefined;
  const items = (data?.items ?? []) as WishItem[];
  const claims = (data?.claims ?? []) as Claim[];

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");
  const [priority, setPriority] = useState("medium");
  const [forMember, setForMember] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [onlyMyGifts, setOnlyMyGifts] = useState(false);
  const [claimTarget, setClaimTarget] = useState<{ item: WishItem; claim?: Claim } | null>(null);

  const memberName = (id: string) => members.find((m) => m.id === id)?.display_name ?? "Miembro";

  const myClaimFor = (itemId: string) =>
    claims.find((c) => c.wishlist_item_id === itemId && c.claimer_member_id === me?.id);
  const otherClaimsFor = (itemId: string) =>
    claims.filter((c) => c.wishlist_item_id === itemId && c.claimer_member_id !== me?.id);

  const grouped = useMemo(() => {
    const visible = items.filter((i) => {
      if (i.status !== "active") return false;
      if (!showDismissed && i.recipient_reaction === "dismissed") return false;
      if (onlyMyGifts && !myClaimFor(i.id)) return false;
      return true;
    });
    const byMember = new Map<string, WishItem[]>();
    for (const item of visible) {
      const list = byMember.get(item.for_member_id) ?? [];
      list.push(item);
      byMember.set(item.for_member_id, list);
    }
    return Array.from(byMember.entries()).sort(([a], [b]) => {
      if (a === me?.id) return -1;
      if (b === me?.id) return 1;
      return memberName(a).localeCompare(memberName(b));
    });
  }, [items, claims, showDismissed, onlyMyGifts, me?.id, members]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setUrl(""); setPrice("");
    setPriority("medium"); setForMember(me?.id ?? "");
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await doCreate({
        data: {
          title: title.trim(),
          description: description.trim() || null,
          url: url.trim() || null,
          estimated_price: price ? Number(price) : null,
          priority: priority as "low" | "medium" | "high",
          for_member_id: forMember || me!.id,
        },
      });
      toast.success("Deseo añadido");
      resetForm();
      setOpen(false);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo añadir el deseo");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !me) {
    return <p className="text-sm text-muted-foreground">Cargando lista de deseos...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Lista de Deseos</h3>
          <p className="text-sm text-muted-foreground">
            Objetos y regalos del hogar. Las reservas de regalo son secretas para quien recibe.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={onlyMyGifts ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyMyGifts((v) => !v)}
          >
            <Gift className="mr-2 h-4 w-4" /> Mis regalos
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDismissed((v) => !v)}>
            {showDismissed ? "Ocultar descartados" : "Ver descartados"}
          </Button>
          <Button size="sm" onClick={() => { resetForm(); setOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Añadir deseo
          </Button>
        </div>
      </div>

      {grouped.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay deseos en la lista.</p>
      )}

      {grouped.map(([memberId, list]) => (
        <div key={memberId} className="space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">
            {memberId === me.id ? "Mis deseos" : `Para ${memberName(memberId)}`}
          </h4>
          {list.map((item) => {
            const isMine = item.for_member_id === me.id;
            const myClaim = myClaimFor(item.id);
            const others = otherClaimsFor(item.id);
            return (
              <Card key={item.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{item.title}</p>
                        <Badge variant="outline">
                          {PRIORITIES.find((p) => p.value === item.priority)?.label}
                        </Badge>
                        {item.recipient_reaction === "liked" && !isMine && (
                          <Badge variant="secondary">Le gusta</Badge>
                        )}
                        {item.recipient_reaction === "dismissed" && (
                          <Badge variant="outline" className="text-muted-foreground">Descartado</Badge>
                        )}
                      </div>
                      {item.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Propuesto por {memberName(item.created_by_member_id)}</span>
                        {item.estimated_price != null && (
                          <span className="flex items-center gap-1">
                            <Euro className="h-3 w-3" /> {Number(item.estimated_price).toFixed(2)}
                          </span>
                        )}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" /> Ver producto
                          </a>
                        )}
                      </div>
                    </div>
                    {(item.created_by_member_id === me.id || isMine) && (
                      <button
                        onClick={async () => {
                          await doDelete({ data: { id: item.id } });
                          refresh();
                          toast.success("Deseo eliminado");
                        }}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Eliminar deseo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {isMine && item.created_by_member_id !== me.id && item.recipient_reaction === "pending" && (
                    <div className="flex items-center gap-2 rounded-md border p-2">
                      <span className="mr-auto text-sm">Sugerencia para ti, ¿te gusta?</span>
                      <Button size="sm" variant="outline" onClick={async () => {
                        await doReact({ data: { id: item.id, reaction: "liked" } });
                        refresh();
                      }}>
                        <Heart className="mr-1 h-3 w-3" /> Me gusta
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await doReact({ data: { id: item.id, reaction: "dismissed" } });
                        refresh();
                      }}>
                        <X className="mr-1 h-3 w-3" /> Descartar
                      </Button>
                    </div>
                  )}

                  {!isMine && (
                    <div className="space-y-2 rounded-md border border-dashed p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {myClaim ? (
                          <>
                            <Badge variant="secondary" className="gap-1">
                              <Gift className="h-3 w-3" />
                              {CLAIM_STATUS.find((s) => s.value === myClaim.status)?.label}
                            </Badge>
                            {myClaim.tracked_price != null && (
                              <span className="text-xs text-muted-foreground">
                                {Number(myClaim.tracked_price).toFixed(2)} €
                                {myClaim.tracked_store ? ` · ${myClaim.tracked_store}` : ""}
                              </span>
                            )}
                            <Button size="sm" variant="outline"
                              onClick={() => setClaimTarget({ item, claim: myClaim })}>
                              Editar seguimiento
                            </Button>
                            <Button size="sm" variant="ghost" onClick={async () => {
                              await doRelease({ data: { id: myClaim.id } });
                              refresh();
                              toast.success("Reserva liberada");
                            }}>
                              Liberar
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setClaimTarget({ item })}>
                            <Gift className="mr-1 h-3 w-3" /> Lo regalo yo
                          </Button>
                        )}
                        {others.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            Reservado también por {others.map((c) => memberName(c.claimer_member_id)).join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Search className="h-3 w-3" /> Buscar precio:
                        </span>
                        {STORES.map((s) => (
                          <a
                            key={s.value}
                            href={s.search(item.title)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded border px-2 py-0.5 hover:bg-accent"
                          >
                            {s.value}
                          </a>
                        ))}
                      </div>
                      {myClaim?.notes && (
                        <p className="text-xs text-muted-foreground">Notas: {myClaim.notes}</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo deseo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Enlace al producto (opcional)</Label>
              <Input type="url" placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio estimado (€)</Label>
                <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Prioridad</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>¿Para quién?</Label>
              <Select value={forMember || me.id} onValueChange={setForMember}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id === me.id ? "Para mí" : m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full" disabled={submitting || !title.trim()}>
                {submitting ? "Añadiendo..." : "Añadir deseo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ClaimDialog
        target={claimTarget}
        onClose={() => setClaimTarget(null)}
        onSave={async (values) => {
          try {
            if (claimTarget?.claim) {
              await doUpdateClaim({ data: { id: claimTarget.claim.id, ...values } });
            } else if (claimTarget) {
              await doClaim({ data: { wishlist_item_id: claimTarget.item.id, ...values } });
            }
            toast.success("Seguimiento guardado (solo tú lo ves)");
            setClaimTarget(null);
            refresh();
          } catch (err: any) {
            toast.error(err?.message || "No se pudo guardar la reserva");
          }
        }}
      />
    </div>
  );
}

function ClaimDialog({
  target,
  onClose,
  onSave,
}: {
  target: { item: WishItem; claim?: Claim } | null;
  onClose: () => void;
  onSave: (values: {
    status: "considering" | "purchased" | "gifted";
    notes: string | null;
    tracked_price: number | null;
    tracked_store: string | null;
    tracked_url: string | null;
  }) => Promise<void>;
}) {
  const [status, setStatus] = useState("considering");
  const [notes, setNotes] = useState("");
  const [trackedPrice, setTrackedPrice] = useState("");
  const [trackedStore, setTrackedStore] = useState("");
  const [trackedUrl, setTrackedUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const key = target ? `${target.item.id}:${target.claim?.id ?? "new"}` : null;
  if (key && key !== loadedFor) {
    setLoadedFor(key);
    setStatus(target!.claim?.status ?? "considering");
    setNotes(target!.claim?.notes ?? "");
    setTrackedPrice(target!.claim?.tracked_price != null ? String(target!.claim.tracked_price) : "");
    setTrackedStore(target!.claim?.tracked_store ?? "");
    setTrackedUrl(target!.claim?.tracked_url ?? target!.item.url ?? "");
  }

  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Seguimiento de regalo</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {target.item.title} — esto es secreto: la persona destinataria nunca verá esta reserva.
            </p>
            <div className="space-y-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CLAIM_STATUS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Precio visto (€)</Label>
                <Input type="number" min={0} step="0.01" value={trackedPrice}
                  onChange={(e) => setTrackedPrice(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tienda</Label>
                <Input placeholder="Amazon, MediaMarkt..." value={trackedStore}
                  onChange={(e) => setTrackedStore(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Enlace de la oferta (opcional)</Label>
              <Input type="url" placeholder="https://..." value={trackedUrl}
                onChange={(e) => setTrackedUrl(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {STORES.map((s) => (
                <a key={s.value} href={s.search(target.item.title)} target="_blank"
                  rel="noopener noreferrer" className={cn("rounded border px-2 py-0.5 hover:bg-accent")}>
                  Buscar en {s.value}
                </a>
              ))}
            </div>
            <DialogFooter>
              <Button
                className="w-full"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  await onSave({
                    status: status as "considering" | "purchased" | "gifted",
                    notes: notes.trim() || null,
                    tracked_price: trackedPrice ? Number(trackedPrice) : null,
                    tracked_store: trackedStore.trim() || null,
                    tracked_url: trackedUrl.trim() || null,
                  });
                  setSaving(false);
                }}
              >
                {saving ? "Guardando..." : "Guardar seguimiento"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
