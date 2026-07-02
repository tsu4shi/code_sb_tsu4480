import { ALLOWED_SYMBOLS, MAX_BULK_SYMBOLS } from "./config.js";
import { NewsError, ValidationError } from "./errors.js";
import { fetchStockQuote } from "./fetchStockQuote.js";

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
 * Fetch regular-session and extended-hours quotes for multiple US tickers.
 * @param {string[]} symbols
 * @returns {Promise<Array<{ symbol: string, quote: object | null, error?: object }>>}
 */
export async function fetchStockQuotes(symbols) {
  const normalizedSymbols = validateSymbols(symbols);
  const results = [];

  for (const symbol of normalizedSymbols) {
    try {
      const quote = await fetchStockQuote(symbol);
      results.push({ symbol, quote });
    } catch (error) {
      results.push({ symbol, quote: null, error: serializeError(error) });
    }
  }

  return results;
}
