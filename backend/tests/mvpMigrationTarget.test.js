import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateMvpMigrationTarget } from "../scripts/mvpMigrationTarget.js";

const approvedHost = "ep-long-pine-b46ow0c0.c-6.us-east-2.aws.neon.tech";
const goodUrl = (query = "sslmode=require&sslaccept=strict", db = "neondb", host = approvedHost) =>
  `postgresql://fixture:fixture@${host}:5432/${db}?${query}`;

function loadPrismaConfig(args, overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.DATABASE_URL;
  if (overrides.MVP_DATABASE_URL === undefined) delete env.MVP_DATABASE_URL;
  if (overrides.PRISMA_MVP_TARGET === undefined) delete env.PRISMA_MVP_TARGET;
  env.DOTENV_CONFIG_PATH = fileURLToPath(new URL("./.env.unused-prisma-test", import.meta.url));

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { loadConfigFromFile } from "@prisma/config";
    process.argv = [process.execPath, "prisma", ...process.argv.slice(1)];
    const { config, error } = await loadConfigFromFile({ configFile: "prisma.config.ts" });
    if (error) {
      console.error(error.error?.message ?? error._tag);
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ url: config.datasource?.url ?? null }));
    }
  `, "--", ...args], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env,
    encoding: "utf8",
  });
  assert.ifError(result.error);
  return result;
}

test("plain client generation loads the config without a datasource, even with the MVP flag", () => {
  for (const overrides of [
    {},
    { PRISMA_MVP_TARGET: "1" },
    { PRISMA_MVP_TARGET: "1", MVP_DATABASE_URL: goodUrl("sslmode=require") },
  ]) {
    const result = loadPrismaConfig(["generate"], overrides);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { url: null });
  }
});

test("migration config still requires strict certificate verification without the MVP flag", () => {
  const args = ["migrate", "deploy"];
  const invalid = loadPrismaConfig(args, { MVP_DATABASE_URL: goodUrl("sslmode=require") });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /require sslaccept=strict/);

  const valid = loadPrismaConfig(args, { MVP_DATABASE_URL: goodUrl() });
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), { url: goodUrl() });
});

test("TypedSQL generation with the MVP flag still validates the database URL", () => {
  const result = loadPrismaConfig(["generate", "--sql"], {
    PRISMA_MVP_TARGET: "1",
    MVP_DATABASE_URL: goodUrl("sslmode=require"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /require sslaccept=strict/);
});

test("accepts only the approved MVP target with TLS and strict certificate verification", () => {
  assert.deepEqual(
    validateMvpMigrationTarget(goodUrl()),
    {
      hostname: approvedHost,
      databaseName: "neondb",
      sslMode: "require",
      sslAcceptMode: "strict",
    },
  );
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
    assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require&sslaccept=strict", "neondb", host)));
  }
});

test("rejects other databases and unexpected ports", () => {
  assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require&sslaccept=strict", "linkbase_phase4a_test")));
  assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require&sslaccept=strict", "production")));
  assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require&sslaccept=strict", "neondb")
    .replace(":5432/", ":6432/")));
});

test("rejects TLS modes unsupported by the Prisma schema engine and malformed TLS settings", () => {
  for (const query of [
    "",
    "sslmode=disable",
    "sslmode=prefer",
    "sslmode=allow",
    "sslmode=verify-ca&sslaccept=strict",
    "sslmode=verify-full&sslaccept=strict",
    "sslmode=require&sslmode=disable",
    "sslmode=require",
    "sslmode=require&sslaccept=accept_invalid_certs",
    "sslmode=require&sslaccept=strict&sslaccept=accept_invalid_certs",
  ]) {
    assert.throws(() => validateMvpMigrationTarget(goodUrl(query)));
  }
});

test("does not return credentials or the original connection string", () => {
  const connectionString = "postgresql://private-user:private-password@" +
    `${approvedHost}:5432/neondb?sslmode=require&sslaccept=strict`;
  const result = JSON.stringify(validateMvpMigrationTarget(connectionString));
  assert.equal(result.includes("private-user"), false);
  assert.equal(result.includes("private-password"), false);
  assert.equal(result.includes("postgresql://"), false);
});
