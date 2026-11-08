const LOCAL_PUBLIC_APP_URL = "http://localhost:5173";
const PRODUCTION_PUBLIC_APP_URL = "https://app.linkbase.co.za";

export function resolvePublicAppUrl(configuredUrl, isDevelopment = false) {
  const value = configuredUrl?.trim() || (
    isDevelopment ? LOCAL_PUBLIC_APP_URL : PRODUCTION_PUBLIC_APP_URL
  );
  return value.replace(/\/+$/, "");
}

const viteEnvironment = import.meta.env || {};
export const PUBLIC_APP_URL = resolvePublicAppUrl(
  viteEnvironment.VITE_PUBLIC_APP_URL,
  viteEnvironment.DEV,
);

export function getPublicProfileUrl(publicId) {
  if (typeof publicId !== "string" || !publicId.trim()) {
    throw new TypeError("A public profile ID is required");
  }
  return `${PUBLIC_APP_URL}/profile/${encodeURIComponent(publicId)}`;
}
