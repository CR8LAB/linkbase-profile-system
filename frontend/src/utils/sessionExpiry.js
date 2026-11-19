import { API_BASE_URL } from "../apiBase.js";

export const SESSION_EXPIRED_EVENT = "linkbase:session-expired";
export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

export function redirectToLoginAfterExpiry(navigate) {
  navigate("/", {
    replace: true,
    state: { message: SESSION_EXPIRED_MESSAGE, sessionExpired: true },
  });
}

function hasBearerAuthorization(input, init) {
  const headers = new Headers(input?.headers || undefined);
  new Headers(init?.headers || undefined).forEach((value, name) => {
    headers.set(name, value);
  });
  return /^Bearer\s+\S+$/i.test(headers.get("Authorization") || "");
}

function isProtectedApiRequest(input, apiBaseUrl) {
  try {
    const requestUrl = new URL(
      typeof input === "string" ? input : input.url,
      globalThis.location?.origin || "http://localhost",
    );
    const apiUrl = new URL(apiBaseUrl);
    return (
      requestUrl.origin === apiUrl.origin &&
      requestUrl.pathname !== `${apiUrl.pathname.replace(/\/$/, "")}/api/auth/logout`
    );
  } catch {
    return false;
  }
}

export function createSessionAwareFetch(
  fetchImpl,
  { storage, apiBaseUrl = API_BASE_URL, onExpired },
) {
  return async function sessionAwareFetch(input, init) {
    const response = await fetchImpl(input, init);
    if (
      response.status === 401 &&
      isProtectedApiRequest(input, apiBaseUrl) &&
      hasBearerAuthorization(input, init) &&
      storage.getItem("token")
    ) {
      storage.removeItem("token");
      onExpired();
    }
    return response;
  };
}

let installed = false;

export function installSessionExpiryHandler() {
  if (installed || typeof window === "undefined") return;
  const nativeFetch = window.fetch.bind(window);
  window.fetch = createSessionAwareFetch(nativeFetch, {
    storage: window.sessionStorage,
    onExpired: () => window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT)),
  });
  installed = true;
}
