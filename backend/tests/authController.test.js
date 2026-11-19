import assert from "node:assert/strict";
import test from "node:test";
import {
  claimProfile,
  completePasswordReset,
  createUser,
  createLoginHandler,
  DUMMY_PASSWORD_HASH,
  login,
  requestPasswordReset,
} from "../src/controllers/authController.js";
import bcrypt from "bcrypt";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("auth endpoints reject malformed credentials before database access", async () => {
  const invalidCases = [
    [login, { body: {} }],
    [
      claimProfile,
      { body: { token: "short", password: "long-enough-password" } },
    ],
    [requestPasswordReset, { body: { email: "not-an-email" } }],
    [
      completePasswordReset,
      { body: { token: "short", password: "long-enough-password" } },
    ],
  ];

  for (const [handler, request] of invalidCases) {
    const response = createResponse();
    await handler(request, response);
    assert.equal(response.statusCode, 400);
    assert.equal(typeof response.body.message, "string");
  }
});

test("claim and reset enforce the shared password policy", async () => {
  const request = { body: { token: "a".repeat(43), password: "too-short" } };

  for (const handler of [claimProfile, completePasswordReset]) {
    const response = createResponse();
    await handler(request, response);
    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /12 characters/);
  }
});

test("admin-created users reject passwords over 72 UTF-8 bytes", async () => {
  const unicodeCharacter = String.fromCodePoint(0x1f600);
  const invalidPasswords = ["a".repeat(73), unicodeCharacter.repeat(19)];

  for (const password of invalidPasswords) {
    const response = createResponse();
    await createUser(
      { body: { email: "customer@example.com", password } },
      response,
    );

    assert.equal(response.statusCode, 400);
    assert.equal(
      response.body.message,
      "Password must not exceed 72 UTF-8 bytes",
    );
  }
});

test("unknown login emails perform a dummy bcrypt comparison", async () => {
  const comparisons = [];
  const handler = createLoginHandler(
    { user: { findUnique: async () => null } },
    async (password, hash) => {
      comparisons.push({ password, hash });
      return false;
    },
  );
  const response = createResponse();

  await handler(
    { body: { email: "missing@example.com", password: "candidate-password" } },
    response,
  );

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.message, "Invalid email or password");
  assert.equal(comparisons.length, 1);
  assert.deepEqual(comparisons[0], {
    password: "candidate-password",
    hash: DUMMY_PASSWORD_HASH,
  });
  assert.equal(bcrypt.getRounds(DUMMY_PASSWORD_HASH), 12);
  assert.equal(await bcrypt.compare("candidate-password", DUMMY_PASSWORD_HASH), false);
});

test("existing login emails compare against their stored bcrypt hash", async () => {
  const storedHash = "$2b$12$stored-user-password-hash-placeholder";
  const comparisons = [];
  const handler = createLoginHandler(
    {
      user: {
        findUnique: async () => ({
          id: "customer-1",
          email: "person@example.com",
          passwordHash: storedHash,
          role: "CUSTOMER",
          tokenVersion: 0,
        }),
      },
    },
    async (password, hash) => {
      comparisons.push({ password, hash });
      return false;
    },
  );
  const response = createResponse();

  await handler(
    { body: { email: "person@example.com", password: "candidate-password" } },
    response,
  );

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.message, "Invalid email or password");
  assert.deepEqual(comparisons, [
    { password: "candidate-password", hash: storedHash },
  ]);
  assert.notEqual(comparisons[0].hash, DUMMY_PASSWORD_HASH);
});

