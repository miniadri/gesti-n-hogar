import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Check, Send } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listHouseholdNotices, dismissHouseholdNotice, publishHouseholdNotice } from "@/lib/household-notices.functions";

export const householdNoticesQuery = { queryKey: ["household-notices"], queryFn: () => listHouseholdNotices() };
export function HouseholdNoticesCard() {
  const { data } = useSuspenseQuery(householdNoticesQuery);
  const queryClient = useQueryClient();
  const dismiss = useServerFn(dismissHouseholdNotice);
  const publish = useServerFn(publishHouseholdNotice);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => { if (!body.trim() || busy) return; setBusy(true); try { await publish({ data: { body } }); setBody(""); queryClient.invalidateQueries({ queryKey: ["household-notices"] }); } finally { setBusy(false); } };
  return <Card className="border-primary/30 bg-primary/5"><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" /> Avisos del hogar</CardTitle></CardHeader><CardContent className="space-y-2"><div className="flex gap-2"><input value={body} maxLength={140} onChange={(e) => setBody(e.target.value)} placeholder="Escribe un aviso puntual (140 caracteres)" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm" /><Button size="sm" disabled={!body.trim() || busy} onClick={send}><Send className="mr-1 h-4 w-4" /> Enviar</Button></div>{data.map((notice: any) => <div key={notice.id} className="flex items-start justify-between gap-3 rounded-md border bg-background p-3"><div><p className="font-medium">{notice.title}</p><p className="text-sm text-muted-foreground">{notice.body}</p></div><Button size="sm" variant="outline" onClick={async () => { await dismiss({ data: { id: notice.id } }); queryClient.invalidateQueries({ queryKey: ["household-notices"] }); }}><Check className="mr-1 h-4 w-4" /> Leído</Button></div>)}</CardContent></Card>;
}
