# AGENTS.md

## Cursor Cloud specific instructions

This is a single, minimal vanilla-JS sandbox bundled with **Parcel v1** (`parcel-bundler`). There is no backend, database, or external service for the Parcel demo. Scripts live in `package.json`; the active entry is `index.html` → `src/index3.js`.

- Dependencies are installed by the startup update script (`npm install`). A `package-lock.json` is committed, so `npm install` resolves against it (use `npm ci` for a clean, lockfile-exact install).
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

## Kakeibo (household budget) tool

A separate **browser tool + Node CLI** for combining MoneyForward ME "収入・支出詳細" CSV exports into one ledger, letting the user manually mark each transaction as belonging to themselves/spouse/shared/excluded (excluded = money-movement-only transactions, e.g. a bank transfer, that should be dropped from all totals), and aggregating expenses by month and person. It is independent of the Parcel demo and the news tool.

- Browser entry: `kakeibo.html` → `src/kakeibo/kakeiboApp.js` (run via `npm run kakeibo`, serves on port 1235). All CSV parsing/marking/aggregation happens client-side; nothing is sent to a server.
- Core modules (framework-agnostic, shared by browser + CLI): `src/kakeibo/csv.js`, `parseMoneyForwardCsv.js`, `combineTransactions.js`, `aggregate.js`, `ledgerCsv.js` (read/write the tool's own "全データCSV" export format, which round-trips both transactions and marks)
- CLI entry point: `node tools/kakeibo/cli.js` (`combine` and `summarize` subcommands) for users who prefer a spreadsheet workflow
- Human docs: `docs/kakeibo.md`
- Agent rules: `.cursor/rules/kakeibo.mdc`
- Tests: `test/kakeibo/kakeibo.test.js` (run via `npm test`), using only fabricated sample data
- Deployment: `.github/workflows/deploy-pages.yml` builds and deploys `index.html` + `kakeibo.html` as a static site to GitHub Pages on push to `main` (requires Settings → Pages → Source = GitHub Actions to be enabled once, manually, on GitHub)

### Privacy (critical)

- This tool processes real personal financial data. **Never commit actual MoneyForward export CSVs, combined ledgers, or exported mark files.** The `data/` directory is gitignored for this reason — keep it that way.
- Test fixtures must use fabricated data only, never a real export.

### Scope limits

- Combine, mark, and aggregate expenses only — no budgeting advice, spending predictions, or investment logic
- Keep separate from `src/index3.js` and `src/news/**` unless explicitly requested otherwise
