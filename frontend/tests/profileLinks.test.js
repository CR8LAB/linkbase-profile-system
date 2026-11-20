import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleMapsEmbedUrl,
  createWhatsAppUrl,
  getSafeGoogleReviewUrl,
} from "../src/utils/profileLinks.js";

test("Google Maps embed URL is generated only from an address", () => {
  const url = new URL(createGoogleMapsEmbedUrl("  10 Market Street, London  "));
  assert.equal(url.origin, "https://www.google.com");
  assert.equal(url.pathname, "/maps");
  assert.equal(url.searchParams.get("q"), "10 Market Street, London");
  assert.equal(url.searchParams.get("output"), "embed");
  assert.equal(createGoogleMapsEmbedUrl("  "), "");
});

test("Google Review destinations must be HTTPS and safe to open in a new tab", () => {
  assert.equal(getSafeGoogleReviewUrl("https://g.page/r/example/review"), "https://g.page/r/example/review");
  assert.equal(getSafeGoogleReviewUrl("http://example.com"), "");
  assert.equal(getSafeGoogleReviewUrl("javascript:alert(1)"), "");
  assert.equal(getSafeGoogleReviewUrl("https://user:pass@example.com"), "");
});

test("WhatsApp links use international digits and reject local-looking numbers", () => {
  assert.equal(createWhatsAppUrl("+44 (20) 7183-8750"), "https://wa.me/442071838750");
  assert.equal(createWhatsAppUrl("+27 82 123 4567"), "https://wa.me/27821234567");
  assert.equal(createWhatsAppUrl("0821234567"), "");
});
