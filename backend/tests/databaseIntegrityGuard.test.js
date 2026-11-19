import assert from "node:assert/strict";
import test from "node:test";
import { validateTestDatabaseUrl } from "./databaseIntegrityGuard.js";

const neonHost = "ep-broad-moon-b49xkrbf.c-6.us-east-2.aws.neon.tech";
const childHost = "ep-sparkling-tree-b4kpmofz.c-6.us-east-2.aws.neon.tech";
const localDatabase = "linkbase_phase4a_test";
const neonDatabase = "neondb";

test("test database guard preserves loopback URLs with required SSL", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    const url = validateTestDatabaseUrl(
      `postgresql://fixture:fixture@${host}:5432/${localDatabase}?sslmode=require`,
    );
    assert.equal(url.pathname, `/${localDatabase}`);
  }
  assert.throws(
    () => validateTestDatabaseUrl("postgresql://fixture:fixture@127.0.0.1/neondb?sslmode=require"),
    /does not match required linkbase_phase4a_test/,
  );
});

test("test database guard permits neondb only on the exact approved Neon host", () => {
  for (const sslmode of ["require", "verify-ca", "verify-full"]) {
    const url = validateTestDatabaseUrl(
      `postgresql://fixture:fixture@${neonHost}:5432/${neonDatabase}?sslmode=${sslmode}`,
    );
    assert.equal(url.hostname, neonHost);
    assert.equal(url.pathname, `/${neonDatabase}`);
  }
  assert.throws(
    () => validateTestDatabaseUrl(`postgresql://fixture:fixture@${neonHost}/${localDatabase}?sslmode=require`),
    /does not match required neondb/,
  );
});

test("test database guard permits the confirmed verification child hostname", () => {
  for (const sslmode of ["require", "verify-ca", "verify-full"]) {
    const url = validateTestDatabaseUrl(
      `postgresql://fixture:fixture@${childHost}:5432/${neonDatabase}?sslmode=${sslmode}`,
    );
    assert.equal(url.hostname, childHost);
    assert.equal(url.pathname, `/${neonDatabase}`);
  }
  assert.throws(
    () => validateTestDatabaseUrl(`postgresql://fixture:fixture@${childHost}/${localDatabase}?sslmode=require`),
    /does not match required neondb/,
  );
});

test("test database guard rejects unexpected and production hosts", () => {
  for (const host of [
    "ep-production-branch.c-6.us-east-2.aws.neon.tech",
    "ep-unknown-child.c-6.us-east-2.aws.neon.tech",
    "other.example.com",
    `${neonHost}.attacker.example`,
  ]) {
    assert.throws(
      () => validateTestDatabaseUrl(`postgresql://fixture:fixture@${host}/${neonDatabase}?sslmode=require`),
      /unapproved database hosts/,
    );
  }
});

test("test database guard requires the exact dedicated database name", () => {
  assert.throws(
    () => validateTestDatabaseUrl(`postgresql://fixture:fixture@${neonHost}/production_db?sslmode=require`),
    /does not match required neondb/,
  );
});

test("test database guard rejects missing, weak, or ambiguous SSL mode", () => {
  for (const query of ["", "?sslmode=disable", "?sslmode=prefer", "?sslmode=require&sslmode=disable"]) {
    assert.throws(
      () => validateTestDatabaseUrl(`postgresql://fixture:fixture@${neonHost}/${neonDatabase}${query}`),
      /require sslmode=require or stricter/,
    );
    assert.throws(
      () => validateTestDatabaseUrl(`postgresql://fixture:fixture@localhost/${localDatabase}${query}`),
      /require sslmode=require or stricter/,
    );
  }
});

test("test database guard never includes credentials in validation errors", () => {
  const url = `postgresql://fixture:do-not-print-this@unexpected.example/${localDatabase}?sslmode=require`;
  assert.throws(() => validateTestDatabaseUrl(url), (error) => {
    assert.match(error.message, /unapproved database hosts/);
    assert.equal(error.message.includes("do-not-print-this"), false);
    assert.equal(error.message.includes(url), false);
    return true;
  });
});

test("test database guard leaves integration tests disabled when unset", () => {
  assert.equal(validateTestDatabaseUrl(undefined), null);
});
