import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CIMA_BASE = "https://cima.aemps.es/cima/rest";

const SearchInput = z.object({
  query: z.string().min(2).max(120),
});

type CimaDoc = {
  tipo?: number;
  url?: string;
  urlHtml?: string;
};

function extractPossibleNationalCode(raw: string) {
  const compact = raw.replace(/\D/g, "");
  const eanMatch = compact.match(/847000(\d{6})\d?/);
  if (eanMatch) return eanMatch[1];
  if (/^\d{6}$/.test(compact)) return compact;
  return null;
}

function docUrl(docs: CimaDoc[] | undefined, tipo: number) {
  const doc = (docs ?? []).find((item) => item.tipo === tipo);
  return doc?.urlHtml ?? doc?.url ?? null;
}

function normalizeCimaMedicine(item: any, detail?: any) {
  const source = detail ?? item;
  const activeIngredients = Array.isArray(source.principiosActivos)
    ? source.principiosActivos.map((ingredient: any) => ingredient.nombre).filter(Boolean)
    : String(source.pactivos ?? source.vtm?.nombre ?? "")
        .split(/[+,;]/)
        .map((part) => part.trim())
        .filter(Boolean);
  const excipients = Array.isArray(source.excipientes)
    ? source.excipientes.map((excipient: any) => excipient.nombre).filter(Boolean)
    : [];

  return {
    nregistro: source.nregistro ?? item.nregistro ?? null,
    cn: source.cn ?? item.cn ?? null,
    name: source.nombre ?? item.nombre ?? "",
    lab: source.labtitular ?? item.labtitular ?? null,
    dose: source.dosis ?? item.dosis ?? null,
    form: source.formaFarmaceuticaSimplificada?.nombre ?? source.formaFarmaceutica?.nombre ?? null,
    prescriptionRequired: Boolean(source.receta ?? item.receta),
    activeIngredients,
    excipients,
    fichaTecnicaUrl: docUrl(source.docs ?? item.docs, 1),
    prospectUrl: docUrl(source.docs ?? item.docs, 2),
    cimaUrl: source.nregistro
      ? `https://cima.aemps.es/cima/publico/detalle.html?nregistro=${encodeURIComponent(source.nregistro)}`
      : "https://cima.aemps.es/cima/publico/home.html",
  };
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "HomeSync CIMA integration",
    },
  });
  if (!response.ok) throw new Error(`CIMA devolvió ${response.status}`);
  return response.json();
}

async function fetchDetailByNregistro(nregistro: string) {
  try {
    return await fetchJson(`${CIMA_BASE}/medicamento?nregistro=${encodeURIComponent(nregistro)}`);
  } catch {
    return null;
  }
}

async function fetchByNationalCode(cn: string) {
  try {
    const detail = await fetchJson(`${CIMA_BASE}/medicamento?cn=${encodeURIComponent(cn)}`);
    if (!detail?.nombre) return null;
    return normalizeCimaMedicine(detail, detail);
  } catch {
    return null;
  }
}

export const searchCimaMedicines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const query = data.query.trim();
    const directCode = extractPossibleNationalCode(query);
    const direct = directCode ? await fetchByNationalCode(directCode) : null;
    if (direct) return { query, source: "cn", results: [direct] };

    const search = await fetchJson(
      `${CIMA_BASE}/medicamentos?nombre=${encodeURIComponent(query)}&pagina=1&tamanioPagina=8`,
    );
    const items = Array.isArray(search.resultados) ? search.resultados.slice(0, 8) : [];
    const results = await Promise.all(
      items.map(async (item: any) => {
        const detail = item.nregistro ? await fetchDetailByNregistro(item.nregistro) : null;
        return normalizeCimaMedicine(item, detail);
      }),
    );
    return { query, source: "name", results };
  });
