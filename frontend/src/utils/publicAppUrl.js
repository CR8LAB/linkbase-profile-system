import { resolvePublicAppUrl as validatePublicAppUrl } from "./productionUrlConfig.js";

export const resolvePublicAppUrl = validatePublicAppUrl;

const viteEnvironment = import.meta.env || {};
const isViteRuntime = typeof import.meta.env !== "undefined";
export const PUBLIC_APP_URL = isViteRuntime
  ? resolvePublicAppUrl(viteEnvironment.VITE_PUBLIC_APP_URL, viteEnvironment.DEV)
  : "https://app.linkbase.co.za";

export function getPublicProfileUrl(publicId) {
  if (typeof publicId !== "string" || !publicId.trim()) {
    throw new TypeError("A public profile ID is required");
  }
  return `${PUBLIC_APP_URL}/profile/${encodeURIComponent(publicId)}`;
}
