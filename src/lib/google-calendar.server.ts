// Google Calendar sync — server-only helpers.
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";
import { getConnectionKeyForUser } from "@/server/appUserConnections.server";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const GOOGLE_CALENDAR_CONNECTOR = "google_calendar";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  etag?: string;
  status?: string;
}

async function gcalFetch(userId: string, path: string, init?: RequestInit) {
  const key = await getConnectionKeyForUser(userId, GOOGLE_CALENDAR_CONNECTOR);
  if (!key) throw new Error("google_not_connected");
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: GOOGLE_CALENDAR_CONNECTOR,
    path,
    init,
  });
  return res;
}

export async function listPrimaryEvents(
  userId: string,
  opts: { timeMinISO: string; timeMaxISO: string },
): Promise<GCalEvent[]> {
  const params = new URLSearchParams({
    timeMin: opts.timeMinISO,
    timeMax: opts.timeMaxISO,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await gcalFetch(userId, `/calendar/v3/calendars/primary/events?${params}`);
  if (!res.ok) throw new Error(`Google list failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return (json.items ?? []) as GCalEvent[];
}

function toGoogleBody(input: {
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
}) {
  const startDate = new Date(input.start_at);
  const endDate = input.end_at
    ? new Date(input.end_at)
    : new Date(startDate.getTime() + 60 * 60 * 1000);
  return {
    summary: input.title,
    description: input.description ?? undefined,
    start: { dateTime: startDate.toISOString() },
    end: { dateTime: endDate.toISOString() },
  };
}

export async function insertPrimaryEvent(
  userId: string,
  input: { title: string; description?: string | null; start_at: string; end_at?: string | null },
): Promise<GCalEvent> {
  const res = await gcalFetch(userId, `/calendar/v3/calendars/primary/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toGoogleBody(input)),
  });
  if (!res.ok) throw new Error(`Google insert failed ${res.status}: ${await res.text()}`);
  return (await res.json()) as GCalEvent;
}

export async function updatePrimaryEvent(
  userId: string,
  eventId: string,
  input: { title: string; description?: string | null; start_at: string; end_at?: string | null },
): Promise<GCalEvent> {
  const res = await gcalFetch(
    userId,
    `/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toGoogleBody(input)),
    },
  );
  if (!res.ok) throw new Error(`Google update failed ${res.status}: ${await res.text()}`);
  return (await res.json()) as GCalEvent;
}

export async function deletePrimaryEvent(userId: string, eventId: string): Promise<void> {
  const res = await gcalFetch(
    userId,
    `/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
  // 404/410 = already gone, treat as success
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google delete failed ${res.status}: ${await res.text()}`);
  }
}

export function extractStartISO(ev: GCalEvent): string | null {
  const s = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
  return s ? new Date(s).toISOString() : null;
}
export function extractEndISO(ev: GCalEvent): string | null {
  const s = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00Z` : null);
  return s ? new Date(s).toISOString() : null;
}
