// Google Calendar sync — server-only helpers.
import { callAsAppUser } from "@/integrations/lovable/appUserConnector";
import {
  getConnectionKeyForUser,
  saveConnectionKeyForUser,
} from "@/server/appUserConnections.server";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
export const GOOGLE_CALENDAR_CONNECTOR = "google_calendar";

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_API_BASE = "https://www.googleapis.com";

type GoogleConnectionToken = {
  provider: "google_oauth";
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  token_type?: string;
};

export interface GCalEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  etag?: string;
  status?: string;
}

function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  return {
    configured: Boolean(clientId && clientSecret && redirectUri),
    clientId,
    clientSecret,
    redirectUri,
  };
}

export function isDirectGoogleOAuthConfigured() {
  return getGoogleOAuthConfig().configured;
}

function stateSecret() {
  const raw = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.APP_USER_CONNECTION_KEY_SECRET;
  if (!raw) throw new Error("GOOGLE_OAUTH_STATE_SECRET or APP_USER_CONNECTION_KEY_SECRET is not set");
  return raw;
}

function signStatePayload(payload: string) {
  return createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

function encodeState(input: { userId: string; returnTo: string }) {
  const payload = Buffer.from(
    JSON.stringify({
      ...input,
      nonce: randomBytes(12).toString("base64url"),
      exp: Date.now() + 10 * 60 * 1000,
    }),
  ).toString("base64url");
  return `${payload}.${signStatePayload(payload)}`;
}

function decodeState(state: string): { userId: string; returnTo: string } {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Estado OAuth inválido");
  const expected = signStatePayload(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("Firma OAuth inválida");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (!parsed.userId || !parsed.returnTo || Date.now() > Number(parsed.exp || 0)) {
    throw new Error("Estado OAuth caducado");
  }
  return { userId: parsed.userId, returnTo: parsed.returnTo };
}

export function createGoogleAuthorizationUrl(userId: string, targetOrigin: string) {
  const cfg = getGoogleOAuthConfig();
  if (!cfg.configured || !cfg.clientId || !cfg.redirectUri) {
    throw new Error("Google Calendar no está configurado. Faltan GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET o GOOGLE_REDIRECT_URI.");
  }

  const returnTo = `${targetOrigin}/settings/google-calendar`;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: encodeState({ userId, returnTo }),
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

function parseStoredGoogleToken(stored: string | null): GoogleConnectionToken | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return parsed?.provider === "google_oauth" && parsed.access_token ? parsed : null;
  } catch {
    return null;
  }
}

async function saveGoogleToken(userId: string, token: GoogleConnectionToken) {
  await saveConnectionKeyForUser(userId, GOOGLE_CALENDAR_CONNECTOR, JSON.stringify(token), {
    provider: "google_oauth",
    connected_at: new Date().toISOString(),
  });
}

export async function exchangeGoogleOAuthCode(code: string, state: string) {
  const cfg = getGoogleOAuthConfig();
  if (!cfg.configured || !cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error("Google Calendar no está configurado");
  }
  const { userId, returnTo } = decodeState(state);
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google token failed ${res.status}: ${JSON.stringify(json)}`);
  if (!json.access_token) throw new Error("Google no devolvió access_token");
  await saveGoogleToken(userId, {
    provider: "google_oauth",
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: Date.now() + Math.max(0, Number(json.expires_in ?? 3600) - 60) * 1000,
    scope: json.scope,
    token_type: json.token_type,
  });
  return returnTo;
}

async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const stored = await getConnectionKeyForUser(userId, GOOGLE_CALENDAR_CONNECTOR);
  const token = parseStoredGoogleToken(stored);
  if (!token) return null;
  if (token.expires_at > Date.now() + 60 * 1000) return token.access_token;
  if (!token.refresh_token) throw new Error("Google Calendar necesita reconexión: falta refresh_token");

  const cfg = getGoogleOAuthConfig();
  if (!cfg.configured || !cfg.clientId || !cfg.clientSecret) throw new Error("Google Calendar no está configurado");

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google refresh failed ${res.status}: ${JSON.stringify(json)}`);
  const next = {
    ...token,
    access_token: json.access_token,
    expires_at: Date.now() + Math.max(0, Number(json.expires_in ?? 3600) - 60) * 1000,
    scope: json.scope ?? token.scope,
    token_type: json.token_type ?? token.token_type,
  };
  await saveGoogleToken(userId, next);
  return next.access_token;
}

async function gcalFetch(userId: string, path: string, init?: RequestInit) {
  const key = await getConnectionKeyForUser(userId, GOOGLE_CALENDAR_CONNECTOR);
  if (!key) throw new Error("google_not_connected");
  const accessToken = await getValidGoogleAccessToken(userId);
  if (accessToken) {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(`${GOOGLE_API_BASE}${path}`, { ...init, headers });
  }
  const res = await callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: GOOGLE_CALENDAR_CONNECTOR,
    path,
    init,
  });
  return res;
}

export async function revokeDirectGoogleConnection(userId: string): Promise<boolean> {
  const stored = await getConnectionKeyForUser(userId, GOOGLE_CALENDAR_CONNECTOR);
  const token = parseStoredGoogleToken(stored);
  if (!token) return false;
  const revokeToken = token.refresh_token || token.access_token;
  await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: revokeToken }),
  }).catch(() => undefined);
  return true;
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
