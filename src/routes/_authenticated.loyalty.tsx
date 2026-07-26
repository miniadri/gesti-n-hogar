import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  CreditCard,
  Plus,
  Camera,
  Upload,
  Loader2,
  Trash2,
  Pencil,
  Search,
  ShieldAlert,
  Users,
  Check,
  ChevronsUpDown,
  Lightbulb,
  ImagePlus,
  HardDrive,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  listLoyaltyCards,
  upsertLoyaltyCard,
  deleteLoyaltyCard,
  scanLoyaltyCard,
} from "@/lib/loyalty-cards.functions";
import { submitMerchantSuggestion } from "@/lib/merchants.functions";
import { BarcodeDisplay } from "@/components/BarcodeDisplay";
import merchantsCatalog from "@/data/merchants.es.json";
import {
  saveLocalImage,
  getLocalImageURL,
  deleteLocalImages,
} from "@/lib/local-images";

type CatalogMerchant = {
  id: string;
  name: string;
  aliases?: string[];
  color: string;
  defaultBarcodeFormat: string;
  category: string;
};
const CATALOG = merchantsCatalog as CatalogMerchant[];

export const Route = createFileRoute("/_authenticated/loyalty")({
  head: () => ({
    meta: [
      { title: "Tarjetas de fidelización - HomeSync" },
      {
        name: "description",
        content:
          "Guarda tus tarjetas de socio y fidelización de comercios en un solo lugar. Nunca tarjetas de pago.",
      },
    ],
  }),
  component: LoyaltyPage,
});

type LoyaltyCard = {
  id: string;
  user_id: string;
  merchant: string;
  card_number: string | null;
  barcode: string | null;
  barcode_format: string | null;
  notes: string | null;
  color: string | null;
  front_image_url: string | null;
  back_image_url: string | null;
  is_shared?: boolean | null;
  household_id?: string | null;
};

const BARCODE_FORMATS = [
  { value: "EAN13", label: "EAN-13" },
  { value: "EAN8", label: "EAN-8" },
  { value: "UPCA", label: "UPC-A" },
  { value: "CODE128", label: "Code 128" },
  { value: "CODE39", label: "Code 39" },
  { value: "ITF14", label: "ITF-14" },
  { value: "QR", label: "QR" },
];

const CARD_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#64748b",
];

function LoyaltyPage() {
  const qc = useQueryClient();
  const doList = useServerFn(listLoyaltyCards);
  const doDelete = useServerFn(deleteLoyaltyCard);

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["loyalty-cards"],
    queryFn: () => doList(),
  });

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<LoyaltyCard | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewing, setViewing] = useState<LoyaltyCard | null>(null);

  const filtered = cards.filter((c: LoyaltyCard) =>
    !search ||
    c.merchant.toLowerCase().includes(search.toLowerCase()) ||
    (c.card_number ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (c.barcode ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (c: LoyaltyCard) => {
    setEditing(c);
    setDialogOpen(true);
  };

  const [suggestOpen, setSuggestOpen] = useState(false);

  const handleDelete = async (c: LoyaltyCard) => {
    if (!confirm(`¿Eliminar la tarjeta de ${c.merchant}?`)) return;
    try {
      await doDelete({ data: { id: c.id } });
      await deleteLocalImages(c.id).catch(() => {});
      qc.invalidateQueries({ queryKey: ["loyalty-cards"] });
      toast.success("Tarjeta eliminada");
    } catch (e: any) {
      toast.error(e.message || "No se pudo eliminar");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CreditCard className="h-6 w-6" /> Tarjetas de fidelización
          </h2>
          <p className="text-muted-foreground">
            Guarda tus tarjetas de socio y puntos. Privadas para ti.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setSuggestOpen(true)}>
            <Lightbulb className="mr-2 h-4 w-4" /> Sugerir comercio
          </Button>
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" /> Nueva tarjeta
          </Button>
        </div>
      </div>


      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Esta sección es solo para tarjetas de fidelización de comercios. <strong>No añadas nunca tarjetas de pago</strong> (Visa, Mastercard, débito o crédito).
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar comercio o número..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
            <CreditCard className="h-10 w-10" />
            <p>No tienes tarjetas aún. Añade una manualmente o escanéala.</p>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Añadir tarjeta
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c: LoyaltyCard) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setViewing(c)}
              className="group text-left"
            >
              <div
                className="relative aspect-[1.6/1] overflow-hidden rounded-xl border border-border p-4 shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
                style={{
                  background: c.color
                    ? `linear-gradient(135deg, ${c.color}, ${c.color}cc)`
                    : "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))",
                  color: "white",
                }}
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-lg font-semibold leading-tight drop-shadow-sm">
                      {c.merchant}
                    </span>
                    <div className="flex items-center gap-1">
                      {c.is_shared && (
                        <span
                          title="Compartida con el hogar"
                          className="flex items-center gap-1 rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur"
                        >
                          <Users className="h-3 w-3" /> Hogar
                        </span>
                      )}
                      <CreditCard className="h-5 w-5 opacity-80" />
                    </div>
                  </div>
                  <div>
                    {c.card_number && (
                      <p className="font-mono text-sm tracking-wider opacity-90">
                        {c.card_number}
                      </p>
                    )}
                    {c.barcode && !c.card_number && (
                      <p className="truncate font-mono text-xs opacity-80">{c.barcode}</p>
                    )}
                    {currentUserId && c.user_id !== currentUserId && (
                      <p className="mt-1 text-[10px] uppercase tracking-wide opacity-75">
                        Compartida por otro miembro
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <CardDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["loyalty-cards"] });
          setDialogOpen(false);
        }}
      />

      <ViewCardDialog
        card={viewing}
        isOwner={!!(viewing && currentUserId && viewing.user_id === currentUserId)}
        onClose={() => setViewing(null)}
        onEdit={(c) => {
          setViewing(null);
          openEdit(c);
        }}
        onDelete={(c) => {
          setViewing(null);
          handleDelete(c);
        }}
      />

      <SuggestMerchantDialog open={suggestOpen} onOpenChange={setSuggestOpen} />
    </div>
  );
}

function ViewCardDialog({
  card,
  isOwner,
  onClose,
  onEdit,
  onDelete,
}: {
  card: LoyaltyCard | null;
  isOwner: boolean;
  onClose: () => void;
  onEdit: (c: LoyaltyCard) => void;
  onDelete: (c: LoyaltyCard) => void;
}) {
  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {card && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {card.merchant}
                {card.is_shared && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <Users className="h-3 w-3" /> Hogar
                  </span>
                )}
              </DialogTitle>
              {card.card_number && (
                <DialogDescription className="font-mono">{card.card_number}</DialogDescription>
              )}
            </DialogHeader>
            {card.barcode ? (
              <div className="rounded-lg border p-3">
                <BarcodeDisplay value={card.barcode} format={card.barcode_format} />
                <p className="mt-2 text-center font-mono text-xs text-muted-foreground">
                  {card.barcode}
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Sin código de barras
              </p>
            )}
            {card.notes && (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{card.notes}</p>
            )}
            {!isOwner && (
              <p className="text-xs text-muted-foreground">
                Esta tarjeta la ha compartido otro miembro del hogar. Solo su propietario puede editarla o borrarla.
              </p>
            )}
            {isOwner && (
              <DialogFooter className="flex flex-row justify-between gap-2 sm:justify-between">
                <Button variant="destructive" size="sm" onClick={() => onDelete(card)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                </Button>
                <Button variant="outline" size="sm" onClick={() => onEdit(card)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CardDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: LoyaltyCard | null;
  onSaved: () => void;
}) {
  const doUpsert = useServerFn(upsertLoyaltyCard);
  const doScan = useServerFn(scanLoyaltyCard);

  const [merchant, setMerchant] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [barcode, setBarcode] = useState("");
  const [format, setFormat] = useState<string>("CODE128");
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState<string>(CARD_COLORS[0]);
  const [frontUrl, setFrontUrl] = useState<string | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const localFrontRef = useRef<HTMLInputElement>(null);
  const localBackRef = useRef<HTMLInputElement>(null);
  const [localFront, setLocalFront] = useState<string | null>(null);
  const [localBack, setLocalBack] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !editing?.id) {
      setLocalFront(null);
      setLocalBack(null);
      return;
    }
    getLocalImageURL(editing.id, "front").then(setLocalFront).catch(() => {});
    getLocalImageURL(editing.id, "back").then(setLocalBack).catch(() => {});
  }, [open, editing?.id]);

  const handleLocalSave = async (side: "front" | "back", file: File) => {
    if (!editing?.id) {
      toast.error("Guarda primero la tarjeta y podrás añadir fotos locales.");
      return;
    }
    try {
      await saveLocalImage(editing.id, side, file);
      const url = await getLocalImageURL(editing.id, side);
      if (side === "front") setLocalFront(url);
      else setLocalBack(url);
      toast.success("Foto guardada solo en este dispositivo");
    } catch (e: any) {
      toast.error(e.message || "No se pudo guardar la foto");
    }
  };

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setMerchant(editing.merchant);
      setCardNumber(editing.card_number ?? "");
      setBarcode(editing.barcode ?? "");
      setFormat(editing.barcode_format || "CODE128");
      setNotes(editing.notes ?? "");
      setColor(editing.color || CARD_COLORS[0]);
      setFrontUrl(editing.front_image_url);
      setIsShared(!!editing.is_shared);
    } else {
      setMerchant("");
      setCardNumber("");
      setBarcode("");
      setFormat("CODE128");
      setNotes("");
      setColor(CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)]);
      setFrontUrl(null);
      setIsShared(false);
    }
  }, [open, editing]);

  const handleFile = async (file: File) => {
    setScanning(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) throw new Error("No sesión");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${Date.now()}_${safeName}`;
      const { data: uploaded, error: upErr } = await supabase.storage
        .from("loyalty-cards")
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("loyalty-cards")
        .createSignedUrl(uploaded.path, 3600);
      if (sErr) throw sErr;
      setFrontUrl(signed.signedUrl);

      const result = await doScan({ data: { imageUrl: signed.signedUrl } });
      if (result.merchant) setMerchant((prev) => prev || result.merchant!);
      if (result.card_number) setCardNumber((prev) => prev || result.card_number!);
      if (result.barcode) setBarcode((prev) => prev || result.barcode!);
      if (result.barcode_format) setFormat(result.barcode_format);
      if (result.notes) setNotes((prev) => prev || result.notes!);
      toast.success("Datos detectados. Revísalos y ajusta lo necesario.");
    } catch (e: any) {
      toast.error(e.message || "Error al escanear");
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    if (!merchant.trim()) {
      toast.error("Introduce el nombre del comercio");
      return;
    }
    setSaving(true);
    try {
      await doUpsert({
        data: {
          id: editing?.id,
          merchant: merchant.trim(),
          card_number: cardNumber.trim() || null,
          barcode: barcode.trim() || null,
          barcode_format: barcode.trim() ? format : null,
          notes: notes.trim() || null,
          color,
          front_image_url: frontUrl,
          is_shared: isShared,
        },
      });
      toast.success(editing ? "Tarjeta actualizada" : "Tarjeta añadida");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar tarjeta" : "Nueva tarjeta"}</DialogTitle>
          <DialogDescription>
            Rellénala manualmente o escanea una foto de la tarjeta para autocompletar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <input
              ref={uploadRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => cameraRef.current?.click()}
              disabled={scanning}
            >
              {scanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Camera className="mr-2 h-4 w-4" />
              )}
              Hacer foto
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => uploadRef.current?.click()}
              disabled={scanning}
            >
              <Upload className="mr-2 h-4 w-4" />
              Subir imagen
            </Button>
          </div>

          <div className="space-y-1">
            <Label htmlFor="merchant">Comercio *</Label>
            <MerchantPicker
              value={merchant}
              onPick={(m) => {
                setMerchant(m.name);
                setColor(m.color);
                if (!barcode) setFormat(m.defaultBarcodeFormat);
              }}
              onFreeText={setMerchant}
            />
            <p className="text-xs text-muted-foreground">
              Busca en el catálogo o escribe libremente si no aparece.
            </p>
          </div>


          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="cardnum">Nº de socio</Label>
              <Input
                id="cardnum"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="barcode">Código de barras</Label>
              <Input
                id="barcode"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>
          </div>

          {barcode && (
            <div className="space-y-1">
              <Label>Formato del código</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BARCODE_FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {CARD_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className={`h-8 w-8 rounded-full border-2 transition-transform ${
                    color === c ? "scale-110 border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="shared" className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Compartir con el hogar
              </Label>
              <p className="text-xs text-muted-foreground">
                Los miembros de tu hogar podrán ver y usar esta tarjeta, pero no editarla ni borrarla.
              </p>
            </div>
            <Switch id="shared" checked={isShared} onCheckedChange={setIsShared} />
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-start gap-2">
              <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 space-y-1">
                <Label className="flex items-center gap-2">Fotos locales</Label>
                <p className="text-xs text-muted-foreground">
                  Se guardan <strong>solo en este dispositivo</strong> (sin coste de almacenamiento).
                  Si limpias los datos del navegador o desinstalas la app, se perderán.
                </p>
              </div>
            </div>
            <input
              ref={localFrontRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLocalSave("front", e.target.files[0])}
            />
            <input
              ref={localBackRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleLocalSave("back", e.target.files[0])}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => localFrontRef.current?.click()}
                className="group relative flex aspect-video items-center justify-center overflow-hidden rounded border border-dashed bg-muted/40 text-xs text-muted-foreground hover:bg-muted"
              >
                {localFront ? (
                  <img src={localFront} alt="Anverso" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <ImagePlus className="h-5 w-5" /> Anverso
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => localBackRef.current?.click()}
                className="group relative flex aspect-video items-center justify-center overflow-hidden rounded border border-dashed bg-muted/40 text-xs text-muted-foreground hover:bg-muted"
              >
                {localBack ? (
                  <img src={localBack} alt="Reverso" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <ImagePlus className="h-5 w-5" /> Reverso
                  </span>
                )}
              </button>
            </div>
            {!editing?.id && (
              <p className="text-xs text-muted-foreground">
                Guarda primero la tarjeta para poder añadir fotos locales.
              </p>
            )}
          </div>
        </div>


        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
