---
name: bulk-stock-quotes
description: Fetch US stock quote data for multiple tickers at once via Finnhub. Use when the user asks to bulk-fetch stock info, compare several symbols, get quotes for a watchlist, or 銘柄情報を一括取得.
---

# Bulk US Stock Quotes

Fetch regular-session and extended-hours quotes for multiple US tickers in one CLI run.

## When to Use

- User provides a list of tickers and wants price/change data for all of them
- User asks to compare several US stocks (e.g. FAANG, Mag 7, a watchlist)
- User mentions 銘柄情報の一括取得, 複数銘柄, or bulk stock quotes

## Prerequisites

1. `.env` exists with a valid `FINNHUB_API_KEY` (see `.env.example`)
2. Dependencies installed: `npm install`

## How to Run

```bash
npm run quotes -- AAPL GOOG MSFT NVDA
npm run quotes -- --symbol AAPL,GOOG,MSFT
npm run quotes -- -s NVDA -s AMD
```

Entry point: `node tools/stock-quotes/cli.js`

## Limits

| Constant | Value | Location |
|----------|-------|----------|
| `MAX_BULK_SYMBOLS` | 10 | `src/news/config.js` |
| `RATE_LIMIT_MS` | 1000 | 2 API calls per symbol (regular + extended) |

Do not exceed 10 unique symbols per request. For larger lists, batch into multiple runs.

## Output

JSON on stdout with per-symbol results:

```json
{
  "disclaimer": "情報提供のみを目的としています。投資助言ではありません。",
  "query": { "symbols": ["AAPL", "GOOG"], "count": 2 },
  "quotes": [
    {
      "symbol": "AAPL",
      "quote": {
        "symbol": "AAPL",
        "regularSession": { "price": 0, "sessionLabel": "通常取引（9:30-16:00 ET）" },
        "latestTrade": { "price": 0, "sessionLabel": "..." },
        "extendedHoursActive": false
      }
    }
  ]
}
```

Each `quote` entry may have `error` instead of quote data if that symbol failed individually.

## Verification

- Inspect JSON stdout from the CLI — do **not** use the Parcel browser console
- Without a valid API key, expect a typed `ConfigError` before any quotes are returned
- Invalid tickers fail validation upfront; upstream failures are isolated per symbol

## Scope

- Quote data only (price, change, session labels) — not investment advice
- For news on a single ticker, use `npm run news -- --symbol TICKER`
- Core modules: `src/news/fetchStockQuotes.js`, `src/news/fetchStockQuote.js`
- Do not modify `src/index3.js` unless explicitly requested

## Related Files

- CLI: `tools/stock-quotes/cli.js`
- Agent rules: `.cursor/rules/us-market-news.mdc`
- Human docs: `docs/us-market-news.md`
