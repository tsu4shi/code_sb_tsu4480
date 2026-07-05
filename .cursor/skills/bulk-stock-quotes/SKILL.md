---
name: bulk-stock-quotes
description: Fetch US stock quotes and company news for multiple tickers at once via Finnhub. Use when the user asks to bulk-fetch stock info with news, compare several symbols, get a watchlist snapshot, or 銘柄情報・ニュースを一括取得.
---

# Bulk US Stock Quotes and News

Fetch regular-session quotes, extended-hours prices, and company news for multiple US tickers in one CLI run.

## When to Use

- User provides a list of tickers and wants price data **and** news for all of them
- User asks to compare several US stocks (e.g. FAANG, Mag 7, a watchlist)
- User mentions 銘柄情報の一括取得, 複数銘柄, ニュースも含めて, or bulk stock quotes

## Prerequisites

1. `.env` exists with a valid `FINNHUB_API_KEY` (see `.env.example`)
2. Dependencies installed: `npm install`

## How to Run

```bash
npm run quotes -- AAPL GOOG MSFT NVDA
npm run quotes -- --symbol AAPL,GOOG,MSFT --limit 5
npm run quotes -- -s NVDA -s AMD -l 3
```

Entry point: `node tools/stock-quotes/cli.js`

## Limits

| Constant | Value | Location |
|----------|-------|----------|
| `MAX_BULK_SYMBOLS` | 10 | `src/news/config.js` |
| `MAX_ARTICLES` | 20 | Per-symbol news cap |
| `RATE_LIMIT_MS` | 1000 | 3 Finnhub calls per symbol (2 quote + 1 company-news) |

Do not exceed 10 unique symbols per request. For larger lists, batch into multiple runs.

## Output

JSON on stdout with per-symbol quote and news:

```json
{
  "disclaimer": "情報提供のみを目的としています。投資助言ではありません。",
  "query": { "symbols": ["AAPL", "GOOG"], "limit": 5, "count": 2 },
  "symbols": [
    {
      "symbol": "AAPL",
      "quote": {
        "symbol": "AAPL",
        "regularSession": { "price": 0, "sessionLabel": "通常取引（9:30-16:00 ET）" },
        "latestTrade": { "price": 0, "sessionLabel": "..." },
        "extendedHoursActive": false
      },
      "articles": [
        {
          "title": "日本語タイトル",
          "titleOriginal": "English headline",
          "url": "https://example.com/article",
          "publishedAt": "2026-07-02T12:00:00.000Z",
          "source": "Reuters"
        }
      ]
    }
  ]
}
```

Per-symbol failures are isolated: `quoteError` and/or `articlesError` may appear without aborting other symbols.

## Verification

- Inspect JSON stdout from the CLI — do **not** use the Parcel browser console
- Without a valid API key, expect a typed `ConfigError` before any data is returned
- Invalid tickers fail validation upfront

## Scope

- Quote and news data only — not investment advice
- For general market news (no ticker), use `npm run news`
- For a single ticker, `npm run news -- --symbol TICKER` also works
- Core modules: `src/news/fetchBulkSymbolInfo.js`, `src/news/fetchStockQuote.js`, `src/news/fetchUsMarketNews.js`
- Do not modify `src/index3.js` unless explicitly requested

## Related Files

- CLI: `tools/stock-quotes/cli.js`
- Agent rules: `.cursor/rules/us-market-news.mdc`
- Human docs: `docs/us-market-news.md`
