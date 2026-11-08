import assert from "node:assert/strict";
import test from "node:test";
import { getPublicProfileUrl, resolvePublicAppUrl } from "../src/utils/publicAppUrl.js";
import { buildVCard } from "../src/utils/vCard.js";

test("public app URL uses the localhost development fallback and trims configured origins", () => {
  assert.equal(resolvePublicAppUrl(undefined, true), "http://localhost:5173");
  assert.equal(
    resolvePublicAppUrl(" https://app.linkbase.co.za/ ", false),
    "https://app.linkbase.co.za",
  );
});

test("public profile URLs use the app domain and permanent profile route", () => {
  assert.equal(
    getPublicProfileUrl("LB 0011"),
    "https://app.linkbase.co.za/profile/LB%200011",
  );
});

test("VCF keeps the LinkBase profile URL and customer website in separate URL fields", () => {
  const vCard = buildVCard({
    publicId: "LB0011",
    fullName: "Mia Mthembu",
    websiteUrl: "https://example.org",
  });
  assert.match(vCard, /URL:https:\/\/app\.linkbase\.co\.za\/profile\/LB0011/);
  assert.match(vCard, /URL;TYPE=WORK:https:\/\/example\.org/);
});
