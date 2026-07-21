import { GOOGLE_CLIENT_ID } from "../kakeibo/runtimeAuthConfig.js";
import { DOCUMENT_AI_OAUTH_SCOPE } from "./config.js";
import { ConfigError } from "./errors.js";

/** @type {{ accessToken: string, expiresAt: number } | null} */
let memoryToken = null;

/** @type {ReturnType<typeof createTokenClient> | null} */
let tokenClient = null;

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** @type {Promise<void> | null} */
let gisScriptPromise = null;

/**
 * Access tokens are kept in memory only — never written to localStorage.
 * @returns {string} Current access token, or empty string if missing/expired.
 */
export function getAccessToken() {
  if (!memoryToken?.accessToken) return "";
  // Refresh a bit early to avoid mid-request expiry.
  if (memoryToken.expiresAt && memoryToken.expiresAt <= Date.now() + 30_000) {
    return "";
  }
  return memoryToken.accessToken;
}

export function clearAccessToken() {
  memoryToken = null;
}

/**
 * @returns {boolean}
 */
export function hasValidAccessToken() {
  return Boolean(getAccessToken());
}

function loadGoogleScript() {
  if (globalThis.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google OAuth の読み込みに失敗しました")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google OAuth の読み込みに失敗しました"));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

function createTokenClient(callback) {
  if (!GOOGLE_CLIENT_ID) {
    throw new ConfigError(
      "Googleログインが設定されていません。GOOGLE_CLIENT_ID を .env に設定し、npm run receipts を再実行してください。"
    );
  }
  if (!globalThis.google?.accounts?.oauth2?.initTokenClient) {
    throw new ConfigError("Google Identity Services が利用できません");
  }
  return globalThis.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DOCUMENT_AI_OAUTH_SCOPE,
    callback,
  });
}

/**
 * Prompt for Document AI OAuth consent and store the access token in memory.
 * Must be called from a user gesture (button click / file drop).
 *
 * @param {{ prompt?: "" | "consent" | "select_account" | "none" }} [options]
 * @returns {Promise<string>} access token
 */
export async function requestDocumentAiAccessToken(options = {}) {
  await loadGoogleScript();

  return new Promise((resolve, reject) => {
    /** @param {object} response */
    const onResponse = (response) => {
      if (response?.error) {
        memoryToken = null;
        reject(
          new ConfigError(
            response.error === "access_denied"
              ? "Document AI の利用が拒否されました。同意画面で許可してください。"
              : `Document AI の認可に失敗しました: ${response.error}`
          )
        );
        return;
      }
      const accessToken = String(response?.access_token || "").trim();
      if (!accessToken) {
        memoryToken = null;
        reject(new ConfigError("アクセストークンを取得できませんでした"));
        return;
      }
      const expiresInSec = Number(response.expires_in) || 3600;
      memoryToken = {
        accessToken,
        expiresAt: Date.now() + expiresInSec * 1000,
      };
      resolve(accessToken);
    };

    try {
      if (!tokenClient) {
        tokenClient = createTokenClient(onResponse);
      } else {
        // Re-bind callback for this request.
        tokenClient = createTokenClient(onResponse);
      }
      tokenClient.requestAccessToken({
        prompt: options.prompt ?? (hasValidAccessToken() ? "" : "consent"),
      });
    } catch (err) {
      reject(err instanceof ConfigError ? err : new ConfigError(err?.message || String(err)));
    }
  });
}

/**
 * Return a valid access token, prompting if needed.
 * @returns {Promise<string>}
 */
export async function ensureAccessToken() {
  const existing = getAccessToken();
  if (existing) return existing;
  return requestDocumentAiAccessToken();
}
