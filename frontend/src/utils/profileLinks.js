export function createGoogleMapsEmbedUrl(address) {
  const normalized = typeof address === "string" ? address.trim() : "";
  if (!normalized) return "";
  const url = new URL("https://www.google.com/maps");
  url.searchParams.set("q", normalized);
  url.searchParams.set("output", "embed");
  return url.href;
}

export function getSafeGoogleReviewUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return "";
    return url.href;
  } catch {
    return "";
  }
}

export function createWhatsAppUrl(value) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (!/^\d{8,15}$/.test(digits) || digits.startsWith("0")) return "";
  return `https://wa.me/${digits}`;
}
