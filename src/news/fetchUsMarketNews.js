import {
  ALLOWED_SYMBOLS,
  COMPANY_NEWS_LOOKBACK_DAYS,
  FINNHUB_BASE_URL,
  MAX_ARTICLES,
  RATE_LIMIT_MS,
  REQUEST_TIMEOUT_MS,
  REQUIRED_ENV,
} from "./config.js";
import {
  AuthError,
  ConfigError,
  RateLimitError,
  TimeoutError,
  UpstreamError,
  ValidationError,
} from "./errors.js";
import { filterValidArticles, normalizeFinnhubArticle } from "./normalize.js";

let lastRequestAt = 0;

function assertEnv() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new ConfigError(`Missing required environment variable: ${key}`);
    }
  }
}

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

async function enforceRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildUrl(path, params) {
  const url = new URL(`${FINNHUB_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function fetchJson(url) {
  await enforceRateLimit();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 401 || response.status === 403) {
      throw new AuthError(
        `Finnhub authentication failed (HTTP ${response.status})`,
        response.status
      );
    }
    if (response.status === 429) {
      throw new RateLimitError(
        "Finnhub rate limit exceeded (HTTP 429)",
        response.status
      );
    }
    if (!response.ok) {
      throw new UpstreamError(
        `Finnhub request failed (HTTP ${response.status})`,
        response.status
      );
    }

    return response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      throw new TimeoutError(
        `Request timed out after ${REQUEST_TIMEOUT_MS}ms`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch US stock market news from Finnhub.
 * @param {{ symbol?: string, limit?: number }} options
 * @returns {Promise<Array<{ title: string, url: string, publishedAt: string, source: string, summary?: string }>>}
 */
export async function fetchUsMarketNews({ symbol, limit } = {}) {
  assertEnv();

  const apiKey = process.env.FINNHUB_API_KEY;
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

  return articles;
}
