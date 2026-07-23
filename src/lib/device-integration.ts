// Heuristic detection of the source integration/app for an HA-synced device.
// HA's REST /api/states doesn't expose the integration name, so we infer it
// from attribution, entity_id and friendly_name keywords.

export type IntegrationKey =
  | "alexa"
  | "google"
  | "tuya"
  | "switchbot"
  | "hue"
  | "shelly"
  | "sonoff"
  | "xiaomi"
  | "meross"
  | "tplink"
  | "homekit"
  | "zigbee"
  | "zwave"
  | "matter"
  | "mqtt"
  | "esphome"
  | "ikea"
  | "aqara"
  | "netatmo"
  | "ring"
  | "other";

export const INTEGRATION_LABELS: Record<IntegrationKey, string> = {
  alexa: "Alexa",
  google: "Google",
  tuya: "Tuya / SmartLife",
  switchbot: "SwitchBot",
  hue: "Philips Hue",
  shelly: "Shelly",
  sonoff: "Sonoff / eWeLink",
  xiaomi: "Xiaomi / Mi Home",
  meross: "Meross",
  tplink: "TP-Link / Kasa",
  homekit: "HomeKit",
  zigbee: "Zigbee",
  zwave: "Z-Wave",
  matter: "Matter",
  mqtt: "MQTT",
  esphome: "ESPHome",
  ikea: "IKEA Tradfri",
  aqara: "Aqara",
  netatmo: "Netatmo",
  ring: "Ring",
  other: "Otro",
};

const RULES: Array<{ key: IntegrationKey; patterns: RegExp[] }> = [
  { key: "alexa", patterns: [/alexa/i, /echo/i, /amazon/i] },
  { key: "google", patterns: [/google/i, /nest/i, /chromecast/i] },
  { key: "tuya", patterns: [/tuya/i, /smart[\s_-]?life/i, /smartlife/i] },
  { key: "switchbot", patterns: [/switch[\s_-]?bot/i] },
  { key: "hue", patterns: [/\bhue\b/i, /philips/i, /signify/i] },
  { key: "shelly", patterns: [/shelly/i] },
  { key: "sonoff", patterns: [/sonoff/i, /ewelink/i] },
  { key: "aqara", patterns: [/aqara/i] },
  { key: "xiaomi", patterns: [/xiaomi/i, /mi[\s_-]?home/i, /miio/i] },
  { key: "meross", patterns: [/meross/i] },
  { key: "tplink", patterns: [/tp[\s_-]?link/i, /kasa/i, /tapo/i] },
  { key: "homekit", patterns: [/homekit/i] },
  { key: "ikea", patterns: [/ikea/i, /tradfri/i] },
  { key: "netatmo", patterns: [/netatmo/i] },
  { key: "ring", patterns: [/\bring\b/i] },
  { key: "esphome", patterns: [/esphome/i] },
  { key: "matter", patterns: [/matter/i] },
  { key: "zigbee", patterns: [/zigbee/i, /z2m/i, /deconz/i] },
  { key: "zwave", patterns: [/z[\s_-]?wave/i, /zwavejs/i] },
  { key: "mqtt", patterns: [/\bmqtt\b/i] },
];

export function detectIntegration(device: {
  name?: string | null;
  external_id?: string | null;
  attributes?: Record<string, any> | null;
}): IntegrationKey {
  const attribution = device.attributes?.attribution ?? "";
  const hay = `${attribution} ${device.name ?? ""} ${device.external_id ?? ""}`;
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(hay))) return rule.key;
  }
  return "other";
}
