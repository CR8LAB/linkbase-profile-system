function parseOrigin(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required in production`);
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must be a valid absolute URL`);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be an HTTPS origin without credentials or a path`);
  }

  return url.origin;
}

export function resolveApiBaseUrl(configuredUrl, isDevelopment = false) {
  if (!configuredUrl?.trim()) {
    if (isDevelopment) return "http://localhost:5000";
    throw new Error("VITE_API_BASE_URL is required in production");
  }

  const value = configuredUrl.trim();
  if (isDevelopment && value.startsWith("http://")) {
    let localUrl;
    try {
      localUrl = new URL(value);
    } catch {
      throw new Error("VITE_API_BASE_URL must be a valid absolute URL");
    }
    if (
      localUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(localUrl.hostname) &&
      !localUrl.username &&
      !localUrl.password &&
      (localUrl.pathname === "/" || localUrl.pathname === "") &&
      !localUrl.search &&
      !localUrl.hash
    ) {
      return localUrl.origin;
    }
  }
  return parseOrigin(value, "VITE_API_BASE_URL");
}

export function resolvePublicAppUrl(configuredUrl, isDevelopment = false) {
  if (!configuredUrl?.trim()) {
    if (isDevelopment) return "http://localhost:5173";
    throw new Error("VITE_PUBLIC_APP_URL is required in production");
  }
  return parseOrigin(configuredUrl, "VITE_PUBLIC_APP_URL");
}
