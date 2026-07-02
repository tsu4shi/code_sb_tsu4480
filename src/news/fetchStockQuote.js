import { ALLOWED_SYMBOLS } from "./config.js";
import { ValidationError } from "./errors.js";
import { buildUrl, fetchJson, getApiKey } from "./finnhubClient.js";

function validateSymbol(symbol) {
  const normalized = String(symbol).trim().toUpperCase();
  if (!ALLOWED_SYMBOLS.test(normalized)) {
    throw new ValidationError(
      `symbol must be 1-5 uppercase letters, got: ${symbol}`
    );
  }
  return normalized;
}

function normalizeQuote(symbol, raw) {
  if (!raw || (raw.c === 0 && raw.pc === 0)) {
    return null;
  }

  return {
    symbol,
    price: raw.c,
    change: raw.d,
    changePercent: raw.dp,
    open: raw.o,
    high: raw.h,
    low: raw.l,
    previousClose: raw.pc,
    updatedAt: raw.t ? new Date(raw.t * 1000).toISOString() : null,
  };
}

/**
 * Fetch regular-session and extended-hours (24h) quotes for a US ticker.
 * Extended hours uses Finnhub's undocumented `trade=true` parameter.
 * @param {string} symbol
 */
export async function fetchStockQuote(symbol) {
  const normalizedSymbol = validateSymbol(symbol);
  const apiKey = getApiKey();

  const regularRaw = await fetchJson(
    buildUrl("/quote", { symbol: normalizedSymbol, token: apiKey })
  );
  const extendedRaw = await fetchJson(
    buildUrl("/quote", {
      symbol: normalizedSymbol,
      token: apiKey,
      trade: "true",
    })
  );

  const regularSession = normalizeQuote(normalizedSymbol, regularRaw);
  const latestTrade = normalizeQuote(normalizedSymbol, extendedRaw);

  if (!regularSession && !latestTrade) {
    return null;
  }

  const extendedHoursActive =
    regularSession &&
    latestTrade &&
    regularSession.price !== latestTrade.price;

  return {
    symbol: normalizedSymbol,
    regularSession: regularSession
      ? { ...regularSession, session: "regular", sessionLabel: "通常取引（9:30-16:00 ET）" }
      : null,
    latestTrade: latestTrade
      ? {
          ...latestTrade,
          session: extendedHoursActive ? "extended" : "regular",
          sessionLabel: extendedHoursActive
            ? "時間外取引（プレマーケット/アフターマーケット含む最新値）"
            : "通常取引の最新値",
        }
      : null,
    extendedHoursActive,
    tradingHoursNote:
      "latestTrade はプレマーケット（4:00-9:30 ET）およびアフターマーケット（16:00-20:00 ET）を含む24時間取引の最新価格です。",
  };
}
