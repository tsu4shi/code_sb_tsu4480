# US Market News Tool

Fetches US stock market news via the Finnhub API and outputs normalized JSON. Includes development guardrails for secrets, rate limits, and error handling.

**Disclaimer:** For informational purposes only. Not investment advice.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env and set FINNHUB_API_KEY (https://finnhub.io/register)
```

## Usage

General US market news:

```bash
npm run news
```

News for a specific ticker:

```bash
npm run news -- --symbol AAPL
npm run news -- --symbol MSFT --limit 5
```

## Documentation

- [Operational guide & troubleshooting](docs/us-market-news.md)
- [Agent instructions](AGENTS.md)
- [Cursor project rules](.cursor/rules/us-market-news.mdc)

## Project layout

```
src/news/           Core fetcher, config, errors, normalization
tools/us-market-news/   CLI entry point
docs/               Human-facing documentation
```

The Parcel browser demo (`index.html` → `src/index3.js`) is separate from the news tool.

## Parcel demo (legacy sandbox)

```bash
npx parcel index.html --port 1234
npm run build
```
