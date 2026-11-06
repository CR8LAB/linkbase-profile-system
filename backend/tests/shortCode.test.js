import assert from "node:assert/strict";
import test from "node:test";
import {
  generateShortCode,
  isValidShortCode,
} from "../src/services/shortCode.js";

test("short codes are random 12-character lowercase hexadecimal identifiers", () => {
  const codes = Array.from({ length: 100 }, generateShortCode);

  assert.ok(codes.every((code) => /^[a-f0-9]{12}$/.test(code)));
  assert.equal(new Set(codes).size, codes.length);
});

test("short code validation rejects malformed path values", () => {
  assert.equal(isValidShortCode("a7c29c3d4e5f"), true);
  assert.equal(isValidShortCode("../admin"), false);
  assert.equal(isValidShortCode("a7c29c3d4e5f78"), false);
  assert.equal(isValidShortCode(null), false);
});
