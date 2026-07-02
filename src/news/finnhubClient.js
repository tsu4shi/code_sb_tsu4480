import {
  FINNHUB_BASE_URL,
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
} from "./errors.js";

let lastRequestAt = 0;

export function assertEnv() {
  for (const key of REQUIRED_ENV) {
    if (!process.env[key]) {
      throw new ConfigError(`Missing required environment variable: ${key}`);
    }
  }
}

export function getApiKey() {
  assertEnv();
  return process.env.FINNHUB_API_KEY;
}

async function enforceRateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

export function buildUrl(path, params) {
  const url = new URL(`${FINNHUB_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function fetchJson(url) {
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
