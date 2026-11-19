import assert from "node:assert/strict";
import test from "node:test";
import { verifyPostgresClientTls } from "./databaseIntegrityTls.js";

function fakeClient({ ssl = {}, encrypted = true, authorized = true } = {}) {
  return {
    connectionParameters: { ssl },
    connection: { stream: { encrypted, authorized } },
  };
}

test("TLS verification rejects an unencrypted PostgreSQL client socket", () => {
  assert.throws(
    () => verifyPostgresClientTls(fakeClient({ encrypted: false })),
    /not encrypted/,
  );
});

test("TLS verification accepts an encrypted and authorized PostgreSQL socket", () => {
  assert.deepEqual(verifyPostgresClientTls(fakeClient()), {
    encrypted: true,
    certificateVerificationEnabled: true,
    certificateAuthorized: true,
  });
});

test("TLS verification rejects an unauthorized certificate when verification is enabled", () => {
  assert.throws(
    () => verifyPostgresClientTls(fakeClient({ authorized: false })),
    /certificate was not authorized/,
  );
});

test("TLS verification reports certificate status when the SSL mode disables verification", () => {
  assert.deepEqual(
    verifyPostgresClientTls(fakeClient({ ssl: { rejectUnauthorized: false }, authorized: false })),
    {
      encrypted: true,
      certificateVerificationEnabled: false,
      certificateAuthorized: false,
    },
  );
});

test("TLS verification rejects a missing SSL client configuration", () => {
  assert.throws(
    () => verifyPostgresClientTls(fakeClient({ ssl: false })),
    /not encrypted/,
  );
});
