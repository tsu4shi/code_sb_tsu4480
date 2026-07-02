import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { DISCLAIMER_JA, MAX_ARTICLES, MAX_BULK_SYMBOLS } from "../../src/news/config.js";
import { fetchBulkSymbolInfo } from "../../src/news/fetchBulkSymbolInfo.js";
import { getApiKey } from "../../src/news/finnhubClient.js";
import { NewsError, ValidationError } from "../../src/news/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

function parseArgs(argv) {
  const options = { symbols: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--symbol" || arg === "-s") {
      const value = argv[++i];
      if (!value) {
        throw new ValidationError("Missing value for --symbol");
      }
      options.symbols.push(...value.split(","));
    } else if (arg === "--limit" || arg === "-l") {
      options.limit = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (!arg.startsWith("-")) {
      options.symbols.push(...arg.split(","));
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node tools/stock-quotes/cli.js [options] [SYMBOLS...]

Options:
  --symbol, -s <TICKERS>   One or more comma-separated US tickers (repeatable)
  --limit,  -l <N>         Max news articles per symbol (1-${MAX_ARTICLES}, default ${MAX_ARTICLES})
  --help,   -h             Show this help

Limits:
  Up to ${MAX_BULK_SYMBOLS} unique symbols per request.
  Each symbol uses 3 Finnhub calls (2 quote + 1 company-news) plus article translation.

Examples:
  npm run quotes -- AAPL GOOG MSFT
  npm run quotes -- --symbol AAPL,GOOG --limit 5
  npm run quotes -- -s NVDA -s AMD -l 3
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const symbols = options.symbols
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    throw new ValidationError("provide at least one symbol");
  }

  getApiKey();

  const limit = options.limit ? Number(options.limit) : undefined;
  const results = await fetchBulkSymbolInfo(symbols, { limit });

  const output = {
    disclaimer: DISCLAIMER_JA,
    query: {
      symbols: results.map((entry) => entry.symbol),
      limit: limit ?? MAX_ARTICLES,
      count: results.length,
    },
    symbols: results,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  if (error instanceof NewsError) {
    console.error(
      JSON.stringify(
        {
          error: error.name,
          code: error.code,
          message: error.message,
          ...(error.status !== undefined && { status: error.status }),
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.error(
    JSON.stringify({ error: "UnexpectedError", message: error.message }, null, 2)
  );
  process.exit(1);
});
