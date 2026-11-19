const LOCAL_PUBLIC_APP_URL = "http://localhost:5173";

function parseHttpsOrigin(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required in production`);
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} must contain valid absolute URLs`);
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must contain HTTPS origins without credentials or paths`);
  }

  return url.origin;
}

export function validateProductionUrlConfig(env = process.env) {
  if (env.NODE_ENV !== "production") {
    return {
      publicAppUrl: env.PUBLIC_APP_URL?.trim() || LOCAL_PUBLIC_APP_URL,
      frontendOrigins: (env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:4173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    };
  }

  const publicAppUrl = parseHttpsOrigin(env.PUBLIC_APP_URL, "PUBLIC_APP_URL");
  if (typeof env.FRONTEND_ORIGINS !== "string" || !env.FRONTEND_ORIGINS.trim()) {
    throw new Error("FRONTEND_ORIGINS is required in production");
  }
  const rawOrigins = env.FRONTEND_ORIGINS.split(",").map((origin) => origin.trim());
  if (rawOrigins.some((origin) => !origin)) {
    throw new Error("FRONTEND_ORIGINS must contain explicit HTTPS origins");
  }
  const frontendOrigins = rawOrigins.map((origin) =>
    parseHttpsOrigin(origin, "FRONTEND_ORIGINS"),
  );

  return { publicAppUrl, frontendOrigins: [...new Set(frontendOrigins)] };
}

export function getConfiguredPublicAppUrl(env = process.env) {
  return validateProductionUrlConfig(env).publicAppUrl;
}
