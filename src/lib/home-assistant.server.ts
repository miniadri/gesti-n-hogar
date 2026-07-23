// Server-only Home Assistant REST client helpers.

export const HA_DOMAINS = [
  "light",
  "switch",
  "climate",
  "sensor",
  "binary_sensor",
  "cover",
  "media_player",
  "vacuum",
] as const;

export type HaDomain = (typeof HA_DOMAINS)[number];

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function haFetch(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${normalizeBaseUrl(baseUrl)}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    return await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function haPing(baseUrl: string, token: string): Promise<void> {
  const res = await haFetch(baseUrl, token, "/api/");
  if (!res.ok) throw new Error(`HA ping failed (${res.status})`);
}

export type HaEntityState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
};

export async function haListStates(baseUrl: string, token: string): Promise<HaEntityState[]> {
  const res = await haFetch(baseUrl, token, "/api/states");
  if (!res.ok) throw new Error(`HA states failed (${res.status})`);
  return (await res.json()) as HaEntityState[];
}

export async function haGetState(
  baseUrl: string,
  token: string,
  entityId: string,
): Promise<HaEntityState> {
  const res = await haFetch(baseUrl, token, `/api/states/${encodeURIComponent(entityId)}`);
  if (!res.ok) throw new Error(`HA state ${entityId} failed (${res.status})`);
  return (await res.json()) as HaEntityState;
}

export async function haCallService(
  baseUrl: string,
  token: string,
  domain: string,
  service: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  const res = await haFetch(baseUrl, token, `/api/services/${domain}/${service}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HA service ${domain}.${service} failed (${res.status}): ${body}`);
  }
  return res.json();
}

export function domainOf(entityId: string): string {
  return entityId.split(".")[0] ?? "";
}

export function mapDomainToDeviceType(domain: string): string {
  switch (domain) {
    case "light":
      return "light";
    case "climate":
      return "thermostat";
    case "binary_sensor":
    case "sensor":
      return "sensor";
    default:
      return "other";
  }
}
