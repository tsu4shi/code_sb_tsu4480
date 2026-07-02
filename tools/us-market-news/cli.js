import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { DISCLAIMER_JA, MAX_ARTICLES } from "../../src/news/config.js";
import { fetchUsMarketNews } from "../../src/news/fetchUsMarketNews.js";
import { fetchStockQuote } from "../../src/news/fetchStockQuote.js";
import { NewsError } from "../../src/news/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env") });

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--symbol" || arg === "-s") {
      options.symbol = argv[++i];
    } else if (arg === "--limit" || arg === "-l") {
      options.limit = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node tools/us-market-news/cli.js [options]

Options:
  --symbol, -s <TICKER>   Fetch news and 24h quote for a US ticker (e.g. GOOG)
  --limit,  -l <N>        Max articles to return (1-${MAX_ARTICLES}, default ${MAX_ARTICLES})
  --help,   -h            Show this help

Examples:
  npm run news
  npm run news -- --symbol GOOG
  npm run news -- --symbol AAPL --limit 5
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const symbol = options.symbol ? String(options.symbol).toUpperCase() : null;

  const output = {
    disclaimer: DISCLAIMER_JA,
    query: {
      symbol,
      limit: options.limit ? Number(options.limit) : undefined,
    },
  };

  if (symbol) {
    output.quote = await fetchStockQuote(symbol);
  }

  output.articles = await fetchUsMarketNews({
    symbol: options.symbol,
    limit: options.limit ? Number(options.limit) : undefined,
  });

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

  console.error(JSON.stringify({ error: "UnexpectedError", message: error.message }, null, 2));
  process.exit(1);
});
