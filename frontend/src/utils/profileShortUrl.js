const SHORT_CODE_PATTERN = /^[a-f0-9]{12}$/i;
const SHORT_URL_DOMAIN = "https://linkbase.co.za";

export function getProfileShortUrl(shortCode) {
  if (typeof shortCode !== "string" || !SHORT_CODE_PATTERN.test(shortCode)) {
    throw new TypeError("A valid profile short code is required");
  }

  return `${SHORT_URL_DOMAIN}/${shortCode.toLowerCase()}`;
}
