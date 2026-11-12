import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createOneTimeToken,
  emailsMatch,
  hashOneTimeToken,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
} from "../src/services/authSecurity.js";
import { createAuthRateLimit } from "../src/middleware/authRateLimit.js";
import { getTrustProxySetting } from "../src/config/trustProxy.js";
import { buildActionUrl } from "../src/services/emailService.js";

test("trust proxy uses one production hop and stays disabled in local development", () => {
  assert.equal(getTrustProxySetting({ NODE_ENV: "production" }), 1);
  assert.equal(getTrustProxySetting({ NODE_ENV: "development" }), false);
  assert.equal(getTrustProxySetting({}), false);
});

test("email validation and normalization are consistent", () => {
  assert.equal(isValidEmail("user@example.com"), true);
  assert.equal(isValidEmail("invalid-address"), false);
  assert.equal(isValidEmail("user @example.com"), false);
  assert.equal(normalizeEmail(" User@Example.com "), "user@example.com");
  assert.equal(emailsMatch("User@Example.com", " user@example.com "), true);
  assert.equal(emailsMatch("user@example.com", "other@example.com"), false);
  assert.equal(emailsMatch(null, "user@example.com"), false);
});

test("password validation enforces minimum length and bcrypt byte limit", () => {
  assert.equal(isValidPassword("long-enough-password"), true);
  assert.equal(isValidPassword("short"), false);
  assert.equal(isValidPassword("a".repeat(73)), false);
  assert.equal(isValidPassword("😀".repeat(18)), true);
  assert.equal(isValidPassword("😀".repeat(19)), false);
});

test("one-time tokens are high entropy and stored as one-way hashes", () => {
  const firstToken = createOneTimeToken();
  const secondToken = createOneTimeToken();
  const tokenHash = hashOneTimeToken(firstToken);

  assert.match(firstToken, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(firstToken, secondToken);
  assert.match(tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(hashOneTimeToken(firstToken), tokenHash);
  assert.notEqual(tokenHash, firstToken);
});

test("claim and reset links require HTTPS outside localhost", () => {
  const previousUrl = process.env.PUBLIC_APP_URL;

  try {
    process.env.PUBLIC_APP_URL = "https://cards.example.com";
    assert.equal(
      buildActionUrl("/claim", "example-token"),
      "https://cards.example.com/claim?token=example-token",
    );

    process.env.PUBLIC_APP_URL = "http://localhost:5173";
    assert.equal(
      buildActionUrl("/reset-password", "example-token"),
      "http://localhost:5173/reset-password?token=example-token",
    );

    process.env.PUBLIC_APP_URL = "http://cards.example.com";
    assert.throws(() => buildActionUrl("/claim", "example-token"), /HTTPS/);
  } finally {
    if (previousUrl === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previousUrl;
  }
});

test("rate limiter returns 429 after the configured request count", async (context) => {
  const app = express();
  app.use(createAuthRateLimit(2));
  app.post("/limited", (req, res) => res.status(200).json({ success: true }));

  const server = app.listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));

  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/limited`;

  assert.equal((await fetch(url, { method: "POST" })).status, 200);
  assert.equal((await fetch(url, { method: "POST" })).status, 200);

  const limitedResponse = await fetch(url, { method: "POST" });
  assert.equal(limitedResponse.status, 429);
  assert.equal(
    (await limitedResponse.json()).message,
    "Too many requests. Please try again later.",
  );
});
