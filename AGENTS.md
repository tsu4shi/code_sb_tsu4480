# AGENTS.md

## Cursor Cloud specific instructions

This is a single, minimal vanilla-JS sandbox bundled with **Parcel v1** (`parcel-bundler`). There is no backend, database, or external service for the Parcel demo. Scripts live in `package.json`; the active entry is `index.html` → `src/index3.js`.

- Dependencies are installed by the startup update script (`npm install`). No lockfile is committed, so the resolved tree can vary slightly between runs.
- Dev server: run `npx parcel index.html --port 1234` rather than `npm start`. The `npm start` script appends `--open`, which tries to launch a browser and is not useful in a headless VM. Default port is `1234`.
- Build: `npm run build` (outputs to `dist/`). There is no separate prod server; serve `dist/` statically if needed.
- No lint or test scripts are defined in this repo.
- The app only logs to the browser console (`checkSum(50, 49)` prints `under 100`); there is no visible UI output beyond the static `updated!` text. Verify behavior via the browser devtools console, not the page body.
- Parcel v1 is unmaintained but builds/runs fine on the VM's Node 22.

## US market news tool

A separate **Node CLI** fetches US stock market news via the Finnhub API. It is independent of the Parcel browser demo.

- Entry point: `node tools/us-market-news/cli.js` (or `npm run news`)
- Core module: `src/news/fetchUsMarketNews.js`
- Guardrails: `src/news/config.js`, `src/news/errors.js`
- Human docs: `docs/us-market-news.md`
- Agent rules: `.cursor/rules/us-market-news.mdc`

### Environment

1. Copy `.env.example` to `.env`
2. Set `FINNHUB_API_KEY` (free key from https://finnhub.io/register)
3. The CLI loads `.env` via `dotenv`; never hardcode keys in source

### Verification

- Run the CLI and inspect JSON stdout — do **not** use the Parcel browser console for news tool verification
- Example: `npm run news` (general market) or `npm run news -- --symbol AAPL`
- Bulk quotes + news: `npm run quotes -- AAPL GOOG MSFT` or `npm run quotes -- --symbol AAPL,GOOG --limit 5` (see `.cursor/skills/bulk-stock-quotes/SKILL.md`)
- Without a valid API key, expect a typed `ConfigError`, not an empty result

### Scope limits

- Fetch and normalize news only — no investment advice, predictions, or trading logic
- Do not modify `src/index3.js` for news features unless explicitly requested
