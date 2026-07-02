# US Market News Tool

Operational guide for fetching US stock market news via Finnhub.

## Overview

This tool retrieves US market news and normalizes results to a consistent JSON schema. It runs as a Node.js CLI and is separate from the Parcel browser demo in this repository.

**Disclaimer:** This tool provides news data for informational purposes only. It does not constitute investment advice. Data accuracy is not guaranteed. Investment decisions are the user's sole responsibility.

## News source

**Finnhub** (https://finnhub.io) is the default provider:

| Endpoint | Use case |
|----------|----------|
| `GET /news?category=general` | Broad US market news |
| `GET /company-news?symbol=...` | News for a specific ticker |

### Why Finnhub

- Free tier available with US equity news coverage
- Simple REST API with JSON responses
- Supports both market-wide and per-ticker queries

### Free tier limits

- 60 API calls per minute (tool enforces 1s spacing between requests)
- Check https://finnhub.io/pricing for current daily/monthly caps
- On HTTP 429, the tool throws a `RateLimitError`

## Setup

1. Register at https://finnhub.io/register and copy your API key
2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Set `FINNHUB_API_KEY` in `.env`
4. Install dependencies:

   ```bash
   npm install
   ```

## Usage

General US market news:

```bash
npm run news
```

News for a specific ticker:

```bash
npm run news -- --symbol AAPL
```

Limit the number of articles (max 20):

```bash
npm run news -- --limit 10
npm run news -- --symbol MSFT --limit 5
```

## Output schema

Each article is normalized to:

```json
{
  "title": "日本語タイトル",
  "titleOriginal": "English headline",
  "url": "https://example.com/article",
  "publishedAt": "2026-07-02T12:00:00.000Z",
  "source": "Reuters",
  "summary": "日本語要約（任意）",
  "summaryOriginal": "English summary (optional)"
}
```

When `--symbol` is provided, the CLI also returns a `quote` object with regular-session and 24-hour extended-hours prices (`latestTrade` uses Finnhub `trade=true`).

CLI output wraps articles with metadata:

```json
{
  "disclaimer": "情報提供のみを目的としています。投資助言ではありません。",
  "query": { "symbol": "GOOG", "limit": 10 },
  "quote": {
    "regularSession": { "price": 357.89, "sessionLabel": "通常取引（9:30-16:00 ET）" },
    "latestTrade": { "price": 355.68, "sessionLabel": "時間外取引（プレマーケット/アフターマーケット含む最新値）" },
    "extendedHoursActive": true
  },
  "articles": [ ... ]
}
```

## Guardrails (runtime)

Defined in `src/news/config.js`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `RATE_LIMIT_MS` | 1000 | Minimum gap between API calls |
| `MAX_ARTICLES` | 20 | Hard cap on returned articles |
| `REQUEST_TIMEOUT_MS` | 10000 | HTTP timeout |
| `ALLOWED_SYMBOLS` | `/^[A-Z]{1,5}$/` | Ticker validation |

## Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `ConfigError: Missing required environment variable` | No `.env` or empty key | Copy `.env.example`, set `FINNHUB_API_KEY` |
| `AuthError` (HTTP 401/403) | Invalid or expired API key | Regenerate key at Finnhub dashboard |
| `RateLimitError` (HTTP 429) | Too many requests | Wait and retry; reduce call frequency |
| `TimeoutError` | Slow or unreachable API | Retry later; check network |
| `UpstreamError` (HTTP 5xx) | Finnhub server issue | Retry later |
| Empty `articles` array | No news in date range (ticker) or genuinely no results | Try a different symbol or broader market query |

## Related files

- Agent rules: `.cursor/rules/us-market-news.mdc`
- Cloud agent instructions: `AGENTS.md`
- Fetcher implementation: `src/news/fetchUsMarketNews.js`
- CLI: `tools/us-market-news/cli.js`
