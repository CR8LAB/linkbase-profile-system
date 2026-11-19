import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {
  createAccountRateLimitKey,
  createAuthAccountRateLimit,
} from "../src/middleware/authRateLimit.js";
import { isValidEmail } from "../src/services/authSecurity.js";
import { createPasswordResetRequestHandler } from "../src/controllers/authController.js";

const genericResetMessage =
  "If an account matches that email, password reset instructions will be sent.";

function startServer(app, context) {
  const server = app.listen(0, "127.0.0.1");
  context.after(() => new Promise((resolve) => server.close(resolve)));
  return new Promise((resolve) => {
    server.once("listening", () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

async function post(baseUrl, path, email, ip) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
    },
    body: JSON.stringify({ email }),
  });
}

test("account limiter keys normalize email and never contain the raw address", () => {
  const secret = "test-only-account-rate-limit-secret";
  const first = createAccountRateLimitKey(" Person@Example.com ", "192.0.2.1", secret);
  const normalized = createAccountRateLimitKey("person@example.com", "192.0.2.2", secret);
  const other = createAccountRateLimitKey("other@example.com", "192.0.2.1", secret);

  assert.equal(first, normalized);
  assert.notEqual(first, other);
  assert.match(first, /^account:[a-f0-9]{64}$/);
  assert.equal(first.includes("person@example.com"), false);

  const malformed = createAccountRateLimitKey("not-an-email", "192.0.2.1", secret);
  assert.match(malformed, /^ip:/);
});

test("login account buckets are shared across IPs, isolated by email, and respond generically", async (context) => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.post(
    "/login",
    createAuthAccountRateLimit(2, {
      windowMs: 60_000,
      secret: "login-test-secret",
      skipSuccessfulRequests: true,
    }),
    (req, res) =>
      res.status(401).json({ message: "Invalid email or password" }),
  );
  const baseUrl = await startServer(app, context);

  const first = await post(baseUrl, "/login", "Victim@example.com", "198.51.100.10");
  const second = await post(baseUrl, "/login", "victim@example.com", "203.0.113.20");
  const limited = await post(baseUrl, "/login", "VICTIM@example.com", "192.0.2.30");
  const otherAccount = await post(baseUrl, "/login", "other@example.com", "192.0.2.30");

  assert.equal(first.status, 401);
  assert.equal(second.status, 401);
  assert.equal(limited.status, 429);
  const limitedBody = await limited.json();
  assert.equal(limitedBody.message, "Too many requests. Please try again later.");
  assert.doesNotMatch(JSON.stringify(limitedBody), /victim@example\.com/i);
  assert.equal(limited.headers.get("ratelimit"), null);
  assert.equal(limited.headers.get("x-ratelimit-limit"), null);
  assert.equal(otherAccount.status, 401);
});

test("successful login attempts do not consume the account failure allowance", async (context) => {
  const app = express();
  app.use(express.json());
  app.post(
    "/login",
    createAuthAccountRateLimit(1, {
      windowMs: 60_000,
      secret: "success-test-secret",
      skipSuccessfulRequests: true,
    }),
    (_req, res) => res.status(200).json({ success: true }),
  );
  const baseUrl = await startServer(app, context);

  assert.equal((await post(baseUrl, "/login", "person@example.com", "198.51.100.1")).status, 200);
  assert.equal((await post(baseUrl, "/login", "person@example.com", "198.51.100.1")).status, 200);
});

test("reset account throttling is silent and gives registered and unknown emails the same response", async (context) => {
  const app = express();
  app.use(express.json());
  let emailSendCount = 0;
  const database = {
    user: {
      async findUnique({ where }) {
        return where.email === "registered@example.com"
          ? { id: "user-1", email: where.email }
          : null;
      },
    },
    passwordResetToken: {
      async update() {},
    },
    async $transaction(work) {
      return work({
        passwordResetToken: {
          async updateMany() {
            return { count: 0 };
          },
          async create() {
            return { id: "reset-1" };
          },
        },
      });
    },
  };
  const resetHandler = createPasswordResetRequestHandler(
    database,
    async () => {
      emailSendCount += 1;
    },
  );
  const accountLimit = createAuthAccountRateLimit(1, {
    windowMs: 60_000,
    secret: "reset-test-secret",
    suppressWhenLimited: true,
  });
  app.post("/reset", accountLimit, resetHandler);
  const baseUrl = await startServer(app, context);

  const responses = [];
  for (const email of ["registered@example.com", "unknown@example.com"]) {
    const normal = await post(baseUrl, "/reset", email, "198.51.100.3");
    const throttled = await post(baseUrl, "/reset", email, "203.0.113.7");

    assert.equal(normal.status, 202);
    assert.equal(throttled.status, 202);
    const normalBody = await normal.json();
    const throttledBody = await throttled.json();
    assert.deepEqual(normalBody, {
      success: true,
      message: genericResetMessage,
    });
    assert.deepEqual(throttledBody, {
      success: true,
      message: genericResetMessage,
    });
    assert.equal(throttled.headers.get("ratelimit"), null);
    responses.push([normal.status, normalBody, throttled.status, throttledBody]);
  }
  assert.deepEqual(responses[0], responses[1]);
  assert.equal(emailSendCount, 1);
});

test("malformed account requests bypass email buckets and reach normal validation", async (context) => {
  const app = express();
  app.use(express.json());
  app.post(
    "/login",
    createAuthAccountRateLimit(1, { secret: "malformed-test-secret" }),
    (req, res) =>
      res.status(isValidEmail(req.body.email) ? 200 : 400).json({
        message: isValidEmail(req.body.email) ? "validated" : "Enter a valid email address",
      }),
  );
  const baseUrl = await startServer(app, context);
  const response = await post(baseUrl, "/login", "bad", "198.51.100.5");

  assert.equal(response.status, 400);
  assert.equal((await response.json()).message, "Enter a valid email address");
});
