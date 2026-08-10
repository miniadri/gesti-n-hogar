# Store catalog multi-provider plan

This module prepares HomeSync to combine live supermarket catalogues with a
weekly cached catalogue. It does not enable cron or automatic scraping yet.

## Live sources

These sources are queried directly from the app server when the user searches:

- Mercadona
- Dia
- Consum

## Cached sources

These sources are intended to be refreshed manually first, and later by a
limited weekly job after measuring cost and stability:

| Store | Initial provider | Secret |
| --- | --- | --- |
| Alcampo | Firecrawl | `FIRECRAWL_API_KEY` |
| El Corte Ingles / Hipercor | Apify | `APIFY_API_TOKEN` |
| Eroski | ScrapingBee | `SCRAPINGBEE_API_KEY` |
| MAS | ScraperAPI | `SCRAPERAPI_KEY` |
| Caprabo | Scrape.do | `SCRAPEDO_TOKEN` |
| Carrefour | Bright Data, reserved | `BRIGHTDATA_API_TOKEN` |

Carrefour remains disabled/external by default until cost and stability are
validated. Bright Data is kept as a reserved professional provider, not as an
active free-tier source.

## Rules

- No full-catalog crawling.
- No live user-facing search through cached providers.
- Cached providers work from an anonymous global queue of terms.
- The queue stores terms and aggregate counters, never the user who searched.
- Every cached product must show `captured_at` in the UI.
- If a source fails, keep the last cache and expose the store search URL.

## Experimental panel

The private Experimental screen now includes a multi-provider catalogue panel:

- provider enabled state;
- weekly/monthly budget;
- estimated credits per query;
- store mode: live, cached, external;
- preferred provider per store;
- weekly term limit and priority;
- manual queue insertion.

The panel is intentionally only configuration and queue management. Automatic
refresh will be a later phase after manual measurements.
