import { ALLOWED_EMAILS, AUTH_SESSION_KEY } from "./authConfig.js";
import { GOOGLE_CLIENT_ID } from "./runtimeAuthConfig.js";
import { isSessionValid, validateGoogleCredential } from "./googleAuth.js";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** @type {Promise<void> | null} */
let gisScriptPromise = null;

/** @type {((user: object) => void) | null} */
let onSignedIn = null;

function getStoredSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeSession(session) {
  sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
}

function setAuthError(message) {
  const errorEl = document.getElementById("auth-error");
  if (!errorEl) return;
  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove("hidden");
  } else {
    errorEl.textContent = "";
    errorEl.classList.add("hidden");
  }
}

function setAppVisible(visible) {
  document.getElementById("auth-section")?.classList.toggle("hidden", visible);
  document.getElementById("app-content")?.classList.toggle("hidden", !visible);
}

function updateUserBar(session) {
  const userBar = document.getElementById("auth-user");
  const emailEl = document.getElementById("auth-email");
  const avatarEl = document.getElementById("auth-avatar");
  if (!userBar || !emailEl || !avatarEl) return;

  if (session) {
    emailEl.textContent = session.email;
    if (session.picture) {
      avatarEl.src = session.picture;
      avatarEl.alt = session.name || session.email;
      avatarEl.classList.remove("hidden");
    } else {
      avatarEl.removeAttribute("src");
      avatarEl.alt = "";
      avatarEl.classList.add("hidden");
    }
    userBar.classList.remove("hidden");
  } else {
    emailEl.textContent = "";
    avatarEl.removeAttribute("src");
    avatarEl.alt = "";
    avatarEl.classList.add("hidden");
    userBar.classList.add("hidden");
  }
}

function handleSignedIn(session) {
  setAuthError("");
  storeSession(session);
  updateUserBar(session);
  setAppVisible(true);
  onSignedIn?.(session);
}

function handleCredentialResponse(response) {
  try {
    const session = validateGoogleCredential(response.credential, ALLOWED_EMAILS);
    handleSignedIn(session);
  } catch (err) {
    setAuthError(err.message);
    setAppVisible(false);
    updateUserBar(null);
  }
}

function loadGoogleScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Googleログインの読み込みに失敗しました")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Googleログインの読み込みに失敗しました"));
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

function renderGoogleButton() {
  const container = document.getElementById("google-signin-button");
  if (!container || !window.google?.accounts?.id) return;

  container.innerHTML = "";
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  window.google.accounts.id.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "rectangular",
    locale: "ja",
  });
}

function signOut() {
  clearSession();
  updateUserBar(null);
  setAppVisible(false);
  setAuthError("");
  if (window.google?.accounts?.id) {
    window.google.accounts.id.disableAutoSelect();
  }
  renderGoogleButton();
}

/**
 * Gate the kakeibo UI behind Google Sign-In.
 * Resolves once a valid, allowlisted session exists.
 */
export function requireAuth() {
  return new Promise((resolve, reject) => {
    onSignedIn = resolve;

    const existing = getStoredSession();
    if (isSessionValid(existing)) {
      document.getElementById("auth-signout")?.addEventListener("click", signOut);
      updateUserBar(existing);
      setAppVisible(true);
      resolve(existing);
      return;
    }
    clearSession();
    updateUserBar(null);
    setAppVisible(false);

    if (!GOOGLE_CLIENT_ID) {
      const message =
        "Googleログインが設定されていません。GOOGLE_CLIENT_ID を .env に設定し、npm run kakeibo を再実行してください。";
      setAuthError(message);
      reject(new Error(message));
      return;
    }

    document.getElementById("auth-signout")?.addEventListener("click", signOut);

    loadGoogleScript()
      .then(() => {
        renderGoogleButton();
      })
      .catch((err) => {
        setAuthError(err.message);
        reject(err);
      });
  });
}
