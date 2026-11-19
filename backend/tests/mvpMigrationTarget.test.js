import assert from "node:assert/strict";
import test from "node:test";
import { validateMvpMigrationTarget } from "../scripts/mvpMigrationTarget.js";

const approvedHost = "ep-long-pine-b46ow0c0.c-6.us-east-2.aws.neon.tech";
const goodUrl = (query = "sslmode=require", db = "neondb", host = approvedHost) =>
  `postgresql://fixture:fixture@${host}:5432/${db}?${query}`;

test("accepts the approved MVP host, database and required TLS modes", () => {
  for (const sslMode of ["require", "verify-ca", "verify-full"]) {
    assert.deepEqual(
      validateMvpMigrationTarget(goodUrl(`sslmode=${sslMode}`)),
      { hostname: approvedHost, databaseName: "neondb", sslMode },
    );
  }
});

test("rejects absent, malformed and non-PostgreSQL URLs without echoing them", () => {
  for (const value of [undefined, "", "not-a-url", "https://secret.example/neondb"]) {
    assert.throws(
      () => validateMvpMigrationTarget(value),
      (error) => {
        assert.doesNotMatch(error.message, /fixture|secret\.example/);
        return error instanceof Error;
      },
    );
  }
});

test("rejects all hosts other than the approved operational endpoint", () => {
  const rejectedHosts = [
    "ep-broad-moon-b49xkrbf.c-6.us-east-2.aws.neon.tech",
    "production.example.neon.tech",
    "other.example.com",
  ];
  for (const host of rejectedHosts) {
    assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require", "neondb", host)));
  }
});

test("rejects other databases and unexpected ports", () => {
  assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require", "linkbase_phase4a_test")));
  assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require", "production")));
  assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require", "neondb")
    .replace(":5432/", ":6432/")));
});

test("rejects missing, weak, duplicated and conflicting SSL modes", () => {
  for (const query of [
    "",
    "sslmode=disable",
    "sslmode=prefer",
    "sslmode=allow",
    "sslmode=require&sslmode=disable",
  ]) {
    assert.throws(() => validateMvpMigrationTarget(goodUrl(query)));
  }
});

test("does not return credentials or the original connection string", () => {
  const connectionString = "postgresql://private-user:private-password@" +
    `${approvedHost}:5432/neondb?sslmode=require`;
  const result = JSON.stringify(validateMvpMigrationTarget(connectionString));
  assert.equal(result.includes("private-user"), false);
  assert.equal(result.includes("private-password"), false);
  assert.equal(result.includes("postgresql://"), false);
});
