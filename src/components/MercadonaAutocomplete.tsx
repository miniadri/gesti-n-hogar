import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchMercadonaProducts } from "@/lib/mercadona.functions";

export type MercadonaSuggestion = {
  id: string;
  ean: string | null;
  display_name: string;
  brand: string | null;
  thumbnail: string | null;
  share_url: string | null;
  category: string | null;
  unit_price: number | null;
  reference_price: number | null;
  reference_format: string | null;
  packaging: string | null;
};

/** Text input with Mercadona catalog autocomplete (price, image and deep link). */
export function MercadonaAutocomplete({
  value,
  onValueChange,
  onSelect,
  placeholder,
  autoFocus,
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (product: MercadonaSuggestion) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
}) {
  const doSearch = useServerFn(searchMercadonaProducts);
  const [results, setResults] = useState<MercadonaSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data: any = await doSearch({ data: { query } });
        if (cancelled) return;
        setResults(data?.results ?? []);
        setOpen((data?.results ?? []).length > 0);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, doSearch]);

  const pick = (product: MercadonaSuggestion) => {
    skipNext.current = true;
    onValueChange(product.display_name);
    onSelect(product);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => onValueChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {loading && (
        <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            Mercadona
          </p>
          {results.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => pick(product)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
            >
              {product.thumbnail ? (
                <img
                  src={product.thumbnail}
                  alt={product.display_name}
                  loading="lazy"
                  className="h-9 w-9 rounded object-contain"
                />
              ) : (
                <div className="h-9 w-9 rounded bg-muted" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{product.display_name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[product.brand, product.packaging].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium">
                {product.unit_price != null ? `${product.unit_price.toFixed(2)} €` : "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Opens the product in the Mercadona app (universal link) or the web store. */
export function MercadonaProductLink({
  productId,
  className,
  label = "Ver en Mercadona",
}: {
  productId?: string | null;
  className?: string;
  label?: string;
}) {
  if (!productId) return null;
  return (
    <a
      href={`https://tienda.mercadona.es/product/${productId}`}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className ?? "inline-flex items-center gap-1 text-xs text-primary hover:underline"}
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  );
}
