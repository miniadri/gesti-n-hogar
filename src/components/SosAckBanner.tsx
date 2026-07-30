import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldAlert, MapPin } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { acknowledgeSos, listPendingSosAcks } from "@/lib/sos.functions";

/**
 * Blocking-style banner shown to any household member that has received a SOS
 * alert and has not acknowledged reception yet. Reminders keep firing every
 * 2 minutes until it is confirmed here, in Telegram or from the push message.
 */
export function SosAckBanner() {
  const fetchPending = useServerFn(listPendingSosAcks);
  const doAck = useServerFn(acknowledgeSos);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["sos-pending-acks"],
    queryFn: () => fetchPending(),
    refetchInterval: 30000,
  });

  const pending = (data ?? []) as any[];
  if (pending.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {pending.map((row) => {
        const ev = row.sos_events ?? {};
        const hasLoc = ev.latitude != null && ev.longitude != null;
        return (
          <div
            key={row.id}
            className="animate-pulse-none rounded-xl border-2 border-destructive bg-destructive/10 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-bold text-destructive">
                  <ShieldAlert className="h-5 w-5" /> SOS de {ev.triggered_by_name ?? "un miembro"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Date(ev.created_at ?? row.created_at).toLocaleString()}
                  {ev.note ? ` · ${ev.note}` : ""}
                </p>
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
                  Debes confirmar la recepción; se reenviará cada 2 minutos hasta que lo hagas.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await doAck({ data: { sosEventId: row.sos_event_id } });
                    toast.success("Recepción del SOS confirmada");
                    queryClient.invalidateQueries({ queryKey: ["sos-pending-acks"] });
                    queryClient.invalidateQueries({ queryKey: ["sos-events"] });
                  } catch (err: any) {
                    toast.error(err?.message || "No se pudo confirmar");
                  }
                }}
              >
                Confirmo que lo he visto
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
