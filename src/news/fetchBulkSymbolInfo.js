import { ALLOWED_SYMBOLS, MAX_BULK_SYMBOLS } from "./config.js";
import { NewsError, ValidationError } from "./errors.js";
import { fetchStockQuote } from "./fetchStockQuote.js";
import { fetchUsMarketNews } from "./fetchUsMarketNews.js";

function normalizeSymbol(symbol) {
  const normalized = String(symbol).trim().toUpperCase();
  if (!ALLOWED_SYMBOLS.test(normalized)) {
    throw new ValidationError(
      `symbol must be 1-5 uppercase letters, got: ${symbol}`
    );
  }
  return normalized;
}

function validateSymbols(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new ValidationError("symbols must be a non-empty array");
  }

  const unique = [...new Set(symbols.map(normalizeSymbol))];
  if (unique.length > MAX_BULK_SYMBOLS) {
    throw new ValidationError(
      `at most ${MAX_BULK_SYMBOLS} unique symbols allowed, got: ${unique.length}`
    );
  }

  return unique;
}

function serializeError(error) {
  if (error instanceof NewsError) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
      ...(error.status !== undefined && { status: error.status }),
    };
  }

  return {
    name: "UnexpectedError",
    code: "UNEXPECTED_ERROR",
    message: error.message,
  };
}

/**
 * Fetch quotes and company news for multiple US tickers.
 * @param {string[]} symbols
 * @param {{ limit?: number }} [options]
 * @returns {Promise<Array<{ symbol: string, quote: object | null, articles: object[], quoteError?: object, articlesError?: object }>>}
 */
export async function fetchBulkSymbolInfo(symbols, { limit } = {}) {
  const normalizedSymbols = validateSymbols(symbols);
  const results = [];

  for (const symbol of normalizedSymbols) {
    const entry = { symbol, quote: null, articles: [] };

    try {
      entry.quote = await fetchStockQuote(symbol);
    } catch (error) {
      entry.quoteError = serializeError(error);
    }

    try {
      entry.articles = await fetchUsMarketNews({ symbol, limit });
    } catch (error) {
      entry.articlesError = serializeError(error);
    }

    results.push(entry);
  }

  return results;
}
