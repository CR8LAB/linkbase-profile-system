const SHORT_CODE_PATTERN = /^[a-f0-9]{12}$/i;
import { PUBLIC_APP_URL } from "./publicAppUrl.js";

export function getProfileShortUrl(shortCode) {
  if (typeof shortCode !== "string" || !SHORT_CODE_PATTERN.test(shortCode)) {
    throw new TypeError("A valid profile short code is required");
  }

  return `${PUBLIC_APP_URL}/${shortCode.toLowerCase()}`;
}
