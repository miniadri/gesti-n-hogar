// Server-only Home Assistant REST client helpers.

const DNS_QUERY_URL = "https://cloudflare-dns.com/dns-query";

export const HA_DOMAINS = [
  "light",
  "switch",
  "climate",
  "sensor",
  "binary_sensor",
  "cover",
  "media_player",
  "vacuum",
  "fan",
  "humidifier",
  "lock",
  "siren",
  "valve",
  "input_boolean",
  "scene",
  "script",
  "button",
] as const;

export type HaDomain = (typeof HA_DOMAINS)[number];

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    n = (n << 8) + value;
  }
  return n >>> 0;
}

function isIpv4InCidr(ip: string, base: string, bits: number): boolean {
  const value = ipv4ToNumber(ip);
  const baseValue = ipv4ToNumber(base);
  if (value === null || baseValue === null) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (baseValue & mask);
}

function normalizeIpv6(ip: string): string {
  return ip.toLowerCase().replace(/^\[|\]$/g, "");
}

function isBlockedIp(ip: string): boolean {
  const v4 = ipv4ToNumber(ip);
  if (v4 !== null) {
    const blockedV4: Array<[string, number]> = [
      ["0.0.0.0", 8],
      ["10.0.0.0", 8],
      ["100.64.0.0", 10],
      ["127.0.0.0", 8],
      ["169.254.0.0", 16],
      ["172.16.0.0", 12],
      ["192.0.0.0", 24],
      ["192.0.2.0", 24],
      ["192.168.0.0", 16],
      ["198.18.0.0", 15],
      ["198.51.100.0", 24],
      ["203.0.113.0", 24],
      ["224.0.0.0", 4],
      ["240.0.0.0", 4],
    ];
    return blockedV4.some(([base, bits]) => isIpv4InCidr(ip, base, bits));
  }

  const v6 = normalizeIpv6(ip);
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fe80:") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("ff") ||
    v6.startsWith("::ffff:10.") ||
    v6.startsWith("::ffff:127.") ||
    v6.startsWith("::ffff:169.254.") ||
    v6.startsWith("::ffff:192.168.")
  );
}

async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  const records: string[] = [];
  for (const type of ["A", "AAAA"]) {
    const url = `${DNS_QUERY_URL}?name=${encodeURIComponent(hostname)}&type=${type}`;
    const res = await fetch(url, {
      headers: { accept: "application/dns-json" },
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
    const json = await res.json();
    for (const answer of json.Answer ?? []) {
      if (answer?.data && typeof answer.data === "string") records.push(answer.data);
    }
  }
  return records;
}

async function assertSafeHomeAssistantUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error("La URL debe usar HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("La URL no debe incluir usuario ni contraseña.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || isBlockedIp(hostname)) {
    throw new Error("La URL apunta a una dirección privada, local o reservada.");
  }

  const resolved = await resolvePublicAddresses(hostname);
  if (resolved.length === 0) {
    throw new Error("No se pudo resolver el dominio de Home Assistant.");
  }
  if (resolved.some(isBlockedIp)) {
    throw new Error("El dominio de Home Assistant resuelve a una dirección privada o reservada.");
  }
}

export async function haFetch(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  await assertSafeHomeAssistantUrl(baseUrl);
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
      redirect: "error",
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
