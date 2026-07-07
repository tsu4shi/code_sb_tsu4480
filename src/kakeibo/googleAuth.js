/**
 * Pure helpers for validating a Google Identity Services credential JWT.
 * No DOM or Google SDK dependencies — safe to unit-test in Node.
 */

/** @param {string} segment */
function decodeBase64Url(segment) {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  if (typeof globalThis.Buffer !== "undefined") {
    return globalThis.Buffer.from(padded, "base64").toString("utf8");
  }
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Decode the payload section of a Google credential JWT.
 * @param {string} credential
 */
export function decodeGoogleJwtPayload(credential) {
  const parts = String(credential || "").split(".");
  if (parts.length !== 3) {
    throw new Error("無効なGoogle認証情報です");
  }
  return JSON.parse(decodeBase64Url(parts[1]));
}

/**
 * @param {string} email
 * @param {string[]} allowedEmails
 */
export function isEmailAllowed(email, allowedEmails) {
  const normalized = String(email || "").trim().toLowerCase();
  return allowedEmails.some((allowed) => allowed.toLowerCase() === normalized);
}

/**
 * @param {{ email?: string, name?: string, picture?: string, exp?: number }} payload
 */
export function sessionFromJwtPayload(payload) {
  return {
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || "",
    exp: payload.exp,
  };
}

/**
 * @param {string} credential - JWT from Google Identity Services
 * @param {string[]} allowedEmails
 */
export function validateGoogleCredential(credential, allowedEmails) {
  const payload = decodeGoogleJwtPayload(credential);
  if (!payload.email) {
    throw new Error("Googleアカウントにメールアドレスがありません");
  }
  if (!isEmailAllowed(payload.email, allowedEmails)) {
    throw new Error(`このGoogleアカウント（${payload.email}）はログインが許可されていません`);
  }
  if (payload.exp && payload.exp * 1000 <= Date.now()) {
    throw new Error("ログインの有効期限が切れています。再度ログインしてください");
  }
  return sessionFromJwtPayload(payload);
}

/**
 * @param {{ email?: string, exp?: number } | null | undefined} session
 */
export function isSessionValid(session) {
  return Boolean(session?.email && session.exp && session.exp * 1000 > Date.now());
}
