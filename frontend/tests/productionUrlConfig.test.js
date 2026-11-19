import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveApiBaseUrl,
  resolvePublicAppUrl,
} from "../src/utils/productionUrlConfig.js";

test("production requires an API origin and accepts only valid HTTPS origins", () => {
  assert.throws(() => resolveApiBaseUrl(undefined, false), /required in production/);
  assert.throws(() => resolveApiBaseUrl("not a URL", false), /valid absolute URL/);
  assert.throws(() => resolveApiBaseUrl("http://api.example.com", false), /HTTPS origin/);
  assert.throws(() => resolveApiBaseUrl("https://user:pass@example.com", false), /HTTPS origin/);
  assert.throws(() => resolveApiBaseUrl("https://api.example.com/path", false), /HTTPS origin/);
  assert.equal(resolveApiBaseUrl("https://api.example.com/", false), "https://api.example.com");
});

test("production requires an HTTPS public app origin", () => {
  assert.throws(() => resolvePublicAppUrl(undefined, false), /required in production/);
  assert.throws(() => resolvePublicAppUrl("bad-url", false), /valid absolute URL/);
  assert.throws(() => resolvePublicAppUrl("http://app.example.com", false), /HTTPS origin/);
  assert.equal(resolvePublicAppUrl("https://app.example.com/", false), "https://app.example.com");
});

test("localhost HTTP defaults remain available only through development mode", () => {
  assert.equal(resolveApiBaseUrl(undefined, true), "http://localhost:5000");
  assert.equal(resolvePublicAppUrl(undefined, true), "http://localhost:5173");
  assert.equal(resolveApiBaseUrl("http://localhost:5001/", true), "http://localhost:5001");
  assert.throws(() => resolveApiBaseUrl("http://localhost.attacker.test", true), /HTTPS origin/);
  assert.throws(() => resolveApiBaseUrl("http://api.example.com", true), /HTTPS origin/);
});
