import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, MapPin } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acknowledgeSos, endSos, listActiveSosAlerts } from "@/lib/sos.functions";

/**
 * Blocking-style banner shown to any household member that has received a SOS
 * alert and has not acknowledged reception yet. Reminders keep firing every
 * 2 minutes only while nobody has confirmed the SOS.
 */
export function SosAckBanner() {
  const fetchActive = useServerFn(listActiveSosAlerts);
  const doAck = useServerFn(acknowledgeSos);
  const doEnd = useServerFn(endSos);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["sos-active-alerts"],
    queryFn: () => fetchActive(),
    refetchInterval: 30000,
  });

  const active = (data ?? []) as any[];
  if (active.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {active.map((ev) => {
        const hasLoc = ev.latitude != null && ev.longitude != null;
        return (
          <div
            key={ev.id}
            className="animate-pulse-none rounded-xl border-2 border-destructive bg-destructive/10 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold text-destructive">
                  <ShieldAlert className="h-5 w-5" /> SOS de {ev.triggered_by_name ?? "un miembro"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(ev.created_at).toLocaleString()}
                  {ev.note ? ` · ${ev.note}` : ""}
                </p>
                {ev.medical_summary && (
                  <div className="mt-2 rounded-lg border border-destructive/30 bg-background/70 p-2 text-sm">
                    <p className="font-semibold text-destructive">Resumen médico</p>
                    <p className="whitespace-pre-line text-muted-foreground">{ev.medical_summary}</p>
                  </div>
                )}
                {hasLoc && (
                  <a
                    href={`https://maps.google.com/?q=${ev.latitude},${ev.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Ver ubicación
                  </a>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {ev.needs_ack
                    ? "Confirma la recepción. Si nadie confirma, el SOS se reenviará cada 2 minutos."
                    : "Recepción confirmada. Finaliza la emergencia cuando ya no sea necesario mantener este aviso activo."}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {ev.needs_ack && (
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      try {
                        await doAck({ data: { sosEventId: ev.id } });
                        toast.success("Recepción del SOS confirmada");
                        queryClient.invalidateQueries({ queryKey: ["sos-active-alerts"] });
                        queryClient.invalidateQueries({ queryKey: ["sos-events"] });
                      } catch (err: any) {
                        toast.error(err?.message || "No se pudo confirmar");
                      }
                    }}
                  >
                    Confirmo que lo he visto
                  </Button>
                )}
                {ev.can_end && !ev.needs_ack && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await doEnd({ data: { sosEventId: ev.id, reason: "Finalizada desde la app" } });
                        toast.success("Emergencia finalizada");
                        queryClient.invalidateQueries({ queryKey: ["sos-active-alerts"] });
                        queryClient.invalidateQueries({ queryKey: ["sos-events"] });
                      } catch (err: any) {
                        toast.error(err?.message || "No se pudo finalizar");
                      }
                    }}
                  >
                    Finalizar emergencia
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
