import { API_BASE_URL } from "../apiBase.js";

export const SESSION_EXPIRED_EVENT = "linkbase:session-expired";
export const SESSION_CHANGED_EVENT = "linkbase:session-changed";
export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

export function redirectToLoginAfterExpiry(navigate) {
  navigate("/", {
    replace: true,
    state: { message: SESSION_EXPIRED_MESSAGE, sessionExpired: true },
  });
}

function getBearerToken(input, init) {
  const headers = new Headers(input?.headers || undefined);
  new Headers(init?.headers || undefined).forEach((value, name) => {
    headers.set(name, value);
  });
  return /^Bearer\s+(\S+)$/i.exec(headers.get("Authorization") || "")?.[1];
}

function isProtectedApiRequest(input, apiBaseUrl) {
  try {
    const requestUrl = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
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
    const currentToken = storage.getItem("token");
    if (
      response.status === 401 &&
      isProtectedApiRequest(input, apiBaseUrl) &&
      currentToken &&
      currentToken === getBearerToken(input, init)
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
