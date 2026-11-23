import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateMvpMigrationTarget } from "../scripts/mvpMigrationTarget.js";
import { verifyMvpMigrationIdentity } from "../scripts/verifyMvpMigrationIdentity.js";

const approvedHost = "ep-dawn-hat-b4oc4nhb.c-6.us-east-2.aws.neon.tech";
const goodUrl = (query = "sslmode=require&sslaccept=strict", db = "neondb", host = approvedHost) =>
  `postgresql://fixture:fixture@${host}:5432/${db}?${query}`;

function loadPrismaConfig(args, overrides = {}, preflightStatus) {
  const env = { ...process.env, ...overrides };
  delete env.DATABASE_URL;
  if (overrides.MVP_DATABASE_URL === undefined) delete env.MVP_DATABASE_URL;
  if (overrides.PRISMA_MVP_TARGET === undefined) delete env.PRISMA_MVP_TARGET;
  if (preflightStatus !== undefined) env.MVP_PREFLIGHT_TEST_STATUS = String(preflightStatus);
  else delete env.MVP_PREFLIGHT_TEST_STATUS;
  env.DOTENV_CONFIG_PATH = fileURLToPath(new URL("./.env.unused-prisma-test", import.meta.url));

  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import assert from "node:assert/strict";
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    import { existsSync } from "node:fs";
    if (process.env.MVP_PREFLIGHT_TEST_STATUS !== undefined) {
      const spawnSync = childProcess.spawnSync;
      childProcess.spawnSync = (command, args, options) => {
        if (!args[0]?.endsWith("verifyMvpMigrationIdentity.js")) return spawnSync(command, args, options);
        assert.ok(existsSync(args[0]));
        assert.equal(options.env.MVP_DATABASE_URL, process.env.MVP_DATABASE_URL);
        return { status: Number(process.env.MVP_PREFLIGHT_TEST_STATUS) };
      };
      syncBuiltinESMExports();
    }
    const { loadConfigFromFile } = await import("@prisma/config");
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

  const valid = loadPrismaConfig(args, { MVP_DATABASE_URL: goodUrl() }, 0);
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), { url: goodUrl() });

  const wrongBranch = loadPrismaConfig(args, { MVP_DATABASE_URL: goodUrl() }, 1);
  assert.equal(wrongBranch.status, 1);
  assert.match(wrongBranch.stderr, /could not verify the approved Neon project, branch, endpoint and database/);
});

test("TypedSQL generation with the MVP flag still validates the database URL", () => {
  const result = loadPrismaConfig(["generate", "--sql"], {
    PRISMA_MVP_TARGET: "1",
    MVP_DATABASE_URL: goodUrl("sslmode=require"),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /require sslaccept=strict/);
});

test("Prisma migration config rejects command-line database URL overrides", () => {
  const result = loadPrismaConfig(["migrate", "dev", "--url=postgresql://other.invalid/neondb"], {
    MVP_DATABASE_URL: goodUrl(),
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reject command-line database URL overrides/);
});

test("accepts only the approved MVP target with TLS and strict certificate verification", () => {
  assert.deepEqual(
    validateMvpMigrationTarget(goodUrl()),
    {
      hostname: approvedHost,
      databaseName: "neondb",
      projectId: "steep-term-83008496",
      branchId: "br-fragrant-cell-b4qjew0b",
      endpointId: "ep-dawn-hat-b4oc4nhb",
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
    "ep-long-pine-b46ow0c0.c-6.us-east-2.aws.neon.tech",
    approvedHost.replace(".c-6", "-pooler.c-6"),
    "ep-broad-moon-b49xkrbf.c-6.us-east-2.aws.neon.tech",
    "production.example.neon.tech",
    "other.example.com",
  ];
  for (const host of rejectedHosts) {
    assert.throws(() => validateMvpMigrationTarget(goodUrl("sslmode=require&sslaccept=strict", "neondb", host)));
  }
});

test("rejects settings that can bypass the approved host, schema, or TLS policy", () => {
  const required = "sslmode=require&sslaccept=strict";
  assert.doesNotThrow(() => validateMvpMigrationTarget(goodUrl(`${required}&schema=public&channel_binding=require`)));
  for (const option of ["host=other.example", "sslrootcert=other.pem", "schema=PUBLIC", "channel_binding=disable", "schema=public&schema=public"]) {
    assert.throws(() => validateMvpMigrationTarget(goodUrl(`${required}&${option}`)));
  }
  assert.throws(() => validateMvpMigrationTarget(goodUrl() + "#fragment"));
});

test("live identity preflight requires read-only verified TLS and matching Neon IDs", async () => {
  const expected = {
    database: "neondb", read_only: "on", project_id: "steep-term-83008496",
    branch_id: "br-fragrant-cell-b4qjew0b", endpoint_id: "ep-dawn-hat-b4oc4nhb",
  };
  async function tryIdentity(identity, authorized = true) {
    const queries = [];
    let closed = false;
    try {
      await verifyMvpMigrationIdentity(goodUrl(), (config) => {
        assert.deepEqual(config.ssl, { rejectUnauthorized: true, servername: approvedHost });
        assert.equal(new URL(config.connectionString).search, "");
        return {
          connection: { stream: { encrypted: true, authorized } },
          async connect() {},
          async query(sql) { queries.push(sql); return { rows: [identity] }; },
          async end() { closed = true; },
        };
      });
      assert.equal(queries[0], "BEGIN READ ONLY");
      assert.equal(queries.at(-1), "ROLLBACK");
    } finally {
      assert.equal(closed, true);
    }
  }
  await tryIdentity(expected);
  for (const field of Object.keys(expected)) {
    await assert.rejects(tryIdentity({ ...expected, [field]: "unexpected" }), /does not match/);
  }
  await assert.rejects(tryIdentity(expected, false), /verified TLS/);
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
