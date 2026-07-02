export const RATE_LIMIT_MS = 1000;
export const MAX_ARTICLES = 20;
/** Max tickers per bulk quote request (2 Finnhub calls each). */
export const MAX_BULK_SYMBOLS = 10;
export const REQUEST_TIMEOUT_MS = 10000;
export const ALLOWED_SYMBOLS = /^[A-Z]{1,5}$/;
export const REQUIRED_ENV = ["FINNHUB_API_KEY"];

export const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

/** Default lookback window for company-news queries (days). */
export const COMPANY_NEWS_LOOKBACK_DAYS = 7;

/** Delay between translation requests (MyMemory free tier). */
export const TRANSLATION_DELAY_MS = 250;

/** Max characters per translation request. */
export const MAX_TRANSLATION_CHARS = 500;

export const DISCLAIMER_JA =
  "情報提供のみを目的としています。投資助言ではありません。";
