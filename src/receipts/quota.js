import { MONTHLY_SOFT_LIMIT, QUOTA_STORAGE_KEY } from "./config.js";

/**
 * @returns {string} Current UTC month key `YYYY-MM`.
 */
export function currentMonthKey(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * @returns {{ month: string, used: number }}
 */
export function readQuota() {
  const month = currentMonthKey();
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) return { month, used: 0 };
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.month !== month) return { month, used: 0 };
    const used = Number(parsed.used);
    return { month, used: Number.isFinite(used) && used > 0 ? Math.floor(used) : 0 };
  } catch {
    return { month, used: 0 };
  }
}

/**
 * @param {number} used
 */
export function writeQuota(used) {
  const month = currentMonthKey();
  const safe = Math.max(0, Math.floor(Number(used) || 0));
  localStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify({ month, used: safe }));
}

/**
 * @param {number} [delta=1]
 * @returns {{ month: string, used: number, remaining: number, limit: number }}
 */
export function recordUsage(delta = 1) {
  const { month, used } = readQuota();
  const next = used + Math.max(0, Math.floor(Number(delta) || 0));
  writeQuota(next);
  return getQuotaStatus();
}

/**
 * @returns {{ month: string, used: number, remaining: number, limit: number }}
 */
export function getQuotaStatus() {
  const { month, used } = readQuota();
  const limit = MONTHLY_SOFT_LIMIT;
  return {
    month,
    used,
    remaining: Math.max(0, limit - used),
    limit,
  };
}

/**
 * How many of `requested` images can still be OCR'd this month.
 * @param {number} requested
 * @returns {{ allowed: number, blocked: number, status: ReturnType<typeof getQuotaStatus> }}
 */
export function planBatch(requested) {
  const status = getQuotaStatus();
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  const allowed = Math.min(want, status.remaining);
  return {
    allowed,
    blocked: want - allowed,
    status,
  };
}
