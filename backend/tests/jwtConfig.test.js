import assert from "node:assert/strict";
import test from "node:test";
import { createLoginHandler } from "../src/controllers/authController.js";
import {
  decodeJwtSecret,
  initializeJwtConfig,
  JWT_ALGORITHM,
} from "../src/config/jwt.js";
import { createAuthenticate } from "../src/middleware/authMiddleware.js";

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

test("startup validation rejects a missing JWT secret", () => {
  assert.throws(
    () => initializeJwtConfig(undefined),
    /JWT_SECRET must be configured/,
  );
});

test("JWT secret validation rejects empty and known placeholder values", () => {
  for (const secret of [
    "",
    "   ",
    "replace-with-a-long-random-secret",
    "base64url:change-me",
    `base64url:${"A".repeat(43)}`,
    `base64url:${"a".repeat(43)}`,
    "hex:your_jwt_secret",
  ]) {
    assert.throws(() => decodeJwtSecret(secret));
  }
});

test("JWT secret validation rejects fewer than 32 decoded bytes", () => {
  const undersizedKey = Buffer.alloc(31, 0x31);
  assert.throws(
    () => decodeJwtSecret(`base64url:${undersizedKey.toString("base64url")}`),
    /at least 32 decoded bytes/,
  );
  assert.throws(
    () => decodeJwtSecret(`hex:${undersizedKey.toString("hex")}`),
    /at least 32 decoded bytes/,
  );
});

test("explicit hex and base64url formats accept 256-bit decoded keys", () => {
  const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index));

  assert.deepEqual(decodeJwtSecret(`hex:${key.toString("hex")}`), key);
  assert.deepEqual(
    decodeJwtSecret(`base64url:${key.toString("base64url")}`),
    key,
  );
  assert.equal(
    initializeJwtConfig(`base64url:${key.toString("base64url")}`).algorithm,
    JWT_ALGORITHM,
  );
  assert.equal(JWT_ALGORITHM, "HS256");
});

test("secret encodings require explicit, canonical format prefixes", () => {
  const encodedHex = Buffer.alloc(32, 0x4a).toString("hex");
  assert.throws(() => decodeJwtSecret(encodedHex), /encoding prefix/);
  assert.throws(() => decodeJwtSecret(`base64url:${"A".repeat(43)}=`), /encoding/);
  assert.throws(() => decodeJwtSecret(`hex:${"4a".repeat(32)}z`), /hex encoding/);
});

test("secret values are absent from authentication logs and responses", async () => {
  const marker = `base64url:${Buffer.alloc(32, 0x7e).toString("base64url")}`;
  const user = {
    id: "customer-1",
    email: "customer@example.com",
    passwordHash: "password-hash",
    role: "CUSTOMER",
    tokenVersion: 0,
  };
  const database = {
    user: {
      async findUnique() {
        return user;
      },
    },
  };
  const logs = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logs.push(args.join(" "));

  try {
    const loginResponse = createResponse();
    await createLoginHandler(
      database,
      async () => true,
      () => initializeJwtConfig(marker),
    )(
      { body: { email: user.email, password: "candidate-password" } },
      loginResponse,
    );

    const authResponse = createResponse();
    await createAuthenticate(database, () => initializeJwtConfig(marker))(
      { headers: { authorization: "Bearer test-token" } },
      authResponse,
      () => {
      assert.fail("authentication must stop when secret configuration fails");
      },
    );

    assert.equal(loginResponse.statusCode, 500);
    assert.equal(loginResponse.body.message, "Login failed");
    assert.equal(authResponse.statusCode, 500);
    assert.equal(authResponse.body.message, "Authentication configuration error");
    assert.doesNotMatch(JSON.stringify([loginResponse.body, authResponse.body, logs]),
      new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    console.error = originalConsoleError;
  }
});
