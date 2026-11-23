import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateMvpMigrationTarget } from "../scripts/mvpMigrationTarget.js";
import { executeTestMigration } from "../scripts/prismaTest.js";
import {
  createTestPrismaConfig,
  validateTestMigrationArguments,
  validateTestMigrationTarget,
} from "../scripts/testMigrationTarget.js";

const childHost = "ep-sparkling-tree-b4kpmofz.c-6.us-east-2.aws.neon.tech";
const phase4aHost = "ep-broad-moon-b49xkrbf.c-6.us-east-2.aws.neon.tech";
const operationalHost = "ep-long-pine-b46ow0c0.c-6.us-east-2.aws.neon.tech";
const productionHost = "ep-production-branch.c-6.us-east-2.aws.neon.tech";
const makeUrl = (host = childHost, database = "neondb", query = "sslmode=verify-full") =>
  `postgresql://fixture:private-test-password@${host}:5432/${database}?${query}`;

test("test migration target accepts exact allowlisted branches only with neondb and full TLS verification", () => {
  for (const host of [childHost, phase4aHost]) {
    const target = validateTestMigrationTarget(makeUrl(host));
    assert.equal(target.hostname, host);
    assert.equal(target.pathname, "/neondb");
    assert.equal(target.searchParams.get("sslmode"), "verify-full");
  }
  assert.equal(
    validateTestMigrationTarget(makeUrl(childHost, "neondb", "sslmode=verify-full&channel_binding=require")).searchParams.get("channel_binding"),
    "require",
  );
});

test("test migration target rejects missing, malformed, production, operational and unknown targets without echoing credentials", () => {
  for (const value of [
    undefined,
    "",
    "not-a-url",
    makeUrl(operationalHost),
    makeUrl(productionHost),
    makeUrl("ep-unknown.c-6.us-east-2.aws.neon.tech"),
  ]) {
    assert.throws(() => validateTestMigrationTarget(value), (error) => {
      assert.doesNotMatch(error.message, /private-test-password|postgresql:\/\//);
      return true;
    });
  }
});

test("test migration target rejects wrong databases, ports, and weakened or ambiguous TLS settings", () => {
  for (const value of [
    makeUrl(childHost, "production"),
    makeUrl(childHost, "linkbase_phase4a_test"),
    `postgresql://fixture:secret@${childHost}:6432/neondb?sslmode=verify-full`,
    makeUrl(childHost, "neondb", "sslmode=require"),
    makeUrl(childHost, "neondb", "sslmode=verify-ca"),
    makeUrl(childHost, "neondb", "sslmode=disable"),
    makeUrl(childHost, "neondb", "sslmode=verify-full&sslmode=disable"),
    makeUrl(childHost, "neondb", "sslmode=verify-full&sslaccept=accept_invalid_certs"),
  ]) {
    assert.throws(() => validateTestMigrationTarget(value));
  }
});

test("wrapper permits only migrate status and deploy", () => {
  assert.deepEqual(validateTestMigrationArguments(["migrate", "status"]), ["migrate", "status"]);
  assert.deepEqual(validateTestMigrationArguments(["migrate", "deploy"]), ["migrate", "deploy"]);
  for (const args of [
    ["migrate", "dev"],
    ["migrate", "reset"],
    ["db", "push"],
    ["migrate", "deploy", "--schema", "other.prisma"],
  ]) assert.throws(() => validateTestMigrationArguments(args));
});

test("Prisma test config uses only the exact approved child URL and verify-full", () => {
  const config = createTestPrismaConfig(makeUrl());
  const url = new URL(config.datasource.url);
  assert.equal(url.hostname, childHost);
  assert.equal(url.pathname, "/neondb");
  assert.equal(url.searchParams.get("sslmode"), "verify-full");
});

test("wrapper strips runtime and production URL overrides and pins the test config", () => {
  let invocation;
  const result = executeTestMigration({
    args: ["migrate", "status"],
    env: {
      LINKBASE_TEST_DATABASE_URL: makeUrl(),
      MVP_DATABASE_URL: makeUrl(operationalHost),
      DATABASE_URL: makeUrl(productionHost),
      PRISMA_MVP_TARGET: "1",
      PGHOST: productionHost,
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      NODE_OPTIONS: "--require=unexpected-hook",
      NODE_EXTRA_CA_CERTS: "untrusted-ca.pem",
      SSL_CERT_FILE: "untrusted-ca.pem",
      OTHER_SETTING: "preserved",
    },
    prismaCliPath: "mock-prisma-cli",
    spawn: (...args) => {
      invocation = args;
      return { status: 0, stdout: "status ok", stderr: "" };
    },
  });
  assert.equal(result.status, 0);
  assert.match(invocation[1].at(-1), /prisma\.test\.config\.ts$/);
  assert.equal(invocation[2].env.LINKBASE_TEST_DATABASE_URL.includes(childHost), true);
  assert.equal("MVP_DATABASE_URL" in invocation[2].env, false);
  assert.equal("DATABASE_URL" in invocation[2].env, false);
  assert.equal("PRISMA_MVP_TARGET" in invocation[2].env, false);
  assert.equal("PGHOST" in invocation[2].env, false);
  assert.equal("NODE_TLS_REJECT_UNAUTHORIZED" in invocation[2].env, false);
  assert.equal("NODE_OPTIONS" in invocation[2].env, false);
  assert.equal("NODE_EXTRA_CA_CERTS" in invocation[2].env, false);
  assert.equal("SSL_CERT_FILE" in invocation[2].env, false);
  assert.equal(invocation[2].env.OTHER_SETTING, "preserved");
});

test("wrapper rejects unsafe targets before starting Prisma and redacts credentials", () => {
  let invoked = false;
  assert.throws(() => executeTestMigration({
    args: ["migrate", "deploy"],
    env: { LINKBASE_TEST_DATABASE_URL: makeUrl(operationalHost) },
    spawn: () => { invoked = true; return { status: 0 }; },
  }));
  assert.equal(invoked, false);
  assert.throws(() => executeTestMigration({
    args: ["migrate", "deploy"],
    env: { LINKBASE_TEST_DATABASE_URL: makeUrl(childHost, "neondb", "sslmode=require") },
    spawn: () => { invoked = true; return { status: 0 }; },
  }));
  assert.equal(invoked, false, "Prisma must not start if TLS verification is weaker than verify-full");

  const captured = executeTestMigration({
    args: ["migrate", "status"],
    env: { LINKBASE_TEST_DATABASE_URL: makeUrl() },
    prismaCliPath: "mock-prisma-cli",
    spawn: () => ({ status: 1, stdout: "", stderr: `failed ${makeUrl()}` }),
  });
  assert.doesNotMatch(captured.stderr, /private-test-password|fixture:/);
  assert.doesNotMatch(captured.stderr, /postgresql:\/\//);
});

test("Prisma config invocation rejects any command options besides its pinned config path", () => {
  assert.deepEqual(
    validateTestMigrationArguments(["migrate", "deploy", "--config", "C:/repo/backend/prisma.test.config.ts"], "C:/repo/backend/prisma.test.config.ts"),
    ["migrate", "deploy"],
  );
  assert.throws(() => validateTestMigrationArguments(
    ["migrate", "deploy", "--config", "prisma.test.config.ts", "--schema", "other.prisma"],
    "C:/repo/backend/prisma.test.config.ts",
  ));
});

test("existing production migration guard behavior and npm scripts remain unchanged", async () => {
  const mvpTls = "sslmode=require&sslaccept=strict";
  assert.equal(validateMvpMigrationTarget(makeUrl(operationalHost, "neondb", mvpTls)).hostname, operationalHost);
  assert.throws(() => validateMvpMigrationTarget(makeUrl(childHost, "neondb", mvpTls)), /unapproved database hosts/);
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(packageJson.scripts["migrate:mvp:status"], "node scripts/prismaMvp.js migrate status");
  assert.equal(packageJson.scripts["migrate:mvp:deploy"], "node scripts/prismaMvp.js migrate deploy");
  assert.equal(packageJson.scripts["migrate:test:status"], "node scripts/prismaTest.js migrate status");
  assert.equal(packageJson.scripts["migrate:test:deploy"], "node scripts/prismaTest.js migrate deploy");
});
