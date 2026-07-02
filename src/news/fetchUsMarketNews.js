import {
  ALLOWED_SYMBOLS,
  COMPANY_NEWS_LOOKBACK_DAYS,
  MAX_ARTICLES,
} from "./config.js";
import {
  UpstreamError,
  ValidationError,
} from "./errors.js";
import { buildUrl, fetchJson, getApiKey } from "./finnhubClient.js";
import { filterValidArticles, normalizeFinnhubArticle } from "./normalize.js";
import { translateArticleToJapanese } from "./translateToJapanese.js";

function validateLimit(limit) {
  const parsed = limit === undefined ? MAX_ARTICLES : Number(limit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError(`limit must be a positive integer, got: ${limit}`);
  }
  return Math.min(parsed, MAX_ARTICLES);
}

function validateSymbol(symbol) {
  if (symbol === undefined || symbol === null || symbol === "") {
    return null;
  }
  const normalized = String(symbol).trim().toUpperCase();
  if (!ALLOWED_SYMBOLS.test(normalized)) {
    throw new ValidationError(
      `symbol must be 1-5 uppercase letters, got: ${symbol}`
    );
  }
  return normalized;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Fetch US stock market news from Finnhub, translated to Japanese.
 * @param {{ symbol?: string, limit?: number }} options
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: string, source: string, summary?: string, titleOriginal: string, summaryOriginal?: string }>>}
 */
export async function fetchUsMarketNews({ symbol, limit } = {}) {
  const apiKey = getApiKey();
  const normalizedSymbol = validateSymbol(symbol);
  const articleLimit = validateLimit(limit);

  let url;
  if (normalizedSymbol) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - COMPANY_NEWS_LOOKBACK_DAYS);
    url = buildUrl("/company-news", {
      symbol: normalizedSymbol,
      from: formatDate(from),
      to: formatDate(to),
      token: apiKey,
    });
  } else {
    url = buildUrl("/news", {
      category: "general",
      token: apiKey,
    });
  }

  const data = await fetchJson(url);

  if (!Array.isArray(data)) {
    throw new UpstreamError("Unexpected Finnhub response format");
  }

  const articles = filterValidArticles(
    data.map(normalizeFinnhubArticle)
  ).slice(0, articleLimit);

  const translated = [];
  for (const article of articles) {
    translated.push(await translateArticleToJapanese(article));
  }

  return translated;
}
