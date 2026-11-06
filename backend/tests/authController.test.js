import assert from "node:assert/strict";
import test from "node:test";
import {
  claimProfile,
  completePasswordReset,
  login,
  requestPasswordReset,
} from "../src/controllers/authController.js";

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

