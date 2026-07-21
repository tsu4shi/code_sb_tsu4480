import { API_KEY_STORAGE_KEY } from "./config.js";

/**
 * @returns {string} Saved Vision API key, or empty string if unset.
 */
export function getApiKey() {
  try {
    return (localStorage.getItem(API_KEY_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

/**
 * @param {string} key
 */
export function setApiKey(key) {
  const trimmed = String(key || "").trim();
  if (!trimmed) {
    clearApiKey();
    return;
  }
  localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
}

export function clearApiKey() {
  localStorage.removeItem(API_KEY_STORAGE_KEY);
}

/**
 * Mask for display (keep last 4 characters).
 * @param {string} key
 * @returns {string}
 */
export function maskApiKey(key) {
  const trimmed = String(key || "").trim();
  if (!trimmed) return "";
  if (trimmed.length <= 4) return "****";
  return `${"•".repeat(Math.min(12, trimmed.length - 4))}${trimmed.slice(-4)}`;
}
