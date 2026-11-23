import assert from "node:assert/strict";
import test from "node:test";
import { executeMvpMigration, redactPrismaOutput } from "../scripts/prismaMvp.js";

const host = "ep-long-pine-b46ow0c0.c-6.us-east-2.aws.neon.tech";
const targetUrl = `postgresql://mvp-user:mvp-password@${host}:5432/neondb?sslmode=require&sslaccept=strict`;

test("MVP wrapper captures sanitized CLI stdout, stderr, exit code and engine process errors", () => {
  const env = {
    MVP_DATABASE_URL: targetUrl,
    DATABASE_URL: "postgresql://runtime-user:runtime-password@runtime.invalid/app",
    JWT_SECRET: "synthetic-jwt-secret-value",
    SMTP_PASSWORD: "synthetic-smtp-password",
    DEBUG: "caller-debug-setting",
    RUST_LOG: "caller-rust-setting",
  };
  const originalEnv = { ...env };
  let invocation;

  const result = executeMvpMigration({
    args: ["migrate", "deploy"],
    env,
    prismaCliPath: "prisma-cli-fixture",
    spawn: (...args) => {
      invocation = args;
      return {
        status: 1,
        stdout: `Schema engine code P3009; target ${targetUrl}`,
        stderr: `TLS diagnostic for ${env.MVP_DATABASE_URL}; ${env.JWT_SECRET}; ${env.SMTP_PASSWORD}`,
        error: Object.assign(new Error("spawn failed"), { code: "EACCES" }),
      };
    },
  });

  assert.equal(result.status, 1);
  assert.equal(result.processErrorCode, "EACCES");
  assert.match(result.stdout, /P3009/);
  assert.match(result.stderr, /TLS diagnostic/);
  for (const secret of [
    "mvp-user", "mvp-password", "runtime-user", "runtime-password",
    env.JWT_SECRET, env.SMTP_PASSWORD, targetUrl,
  ]) {
    assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
  }
  assert.equal(invocation[1][0], "prisma-cli-fixture");
  assert.deepEqual(invocation[1].slice(1), ["migrate", "deploy"]);
  assert.equal(invocation[2].env.MVP_DATABASE_URL, targetUrl);
  assert.equal(invocation[2].env.DATABASE_URL, env.DATABASE_URL);
  assert.equal(invocation[2].env.PRISMA_MVP_TARGET, "1");
  assert.match(invocation[2].env.DEBUG, /prisma:schemaEngine:stderr/);
  assert.match(invocation[2].env.RUST_LOG, /quaint=error/);
  assert.deepEqual(env, originalEnv, "diagnostic settings must not mutate the caller environment");
});

test("redaction covers URLs and named secret values embedded in engine errors", () => {
  const env = {
    MVP_DATABASE_URL: targetUrl,
    JWT_SECRET: "synthetic-secret-123456",
    STORAGE_PRIVATE_KEY: "synthetic-private-key-123456",
  };
  const output = redactPrismaOutput(
    `dsn=${targetUrl}; secret=${env.JWT_SECRET}; key=${env.STORAGE_PRIVATE_KEY}; password=loose-password-value`,
    env,
    new URL(targetUrl),
  );

  assert.doesNotMatch(output, /mvp-user|mvp-password|synthetic-secret|synthetic-private-key|loose-password-value/);
  assert.match(output, /PostgreSQL connection URL redacted|\[REDACTED\]/);
});

test("MVP wrapper refuses DATABASE_URL-only configuration before starting Prisma", () => {
  let invoked = false;
  assert.throws(
    () => executeMvpMigration({
      args: ["migrate", "status"],
      env: { DATABASE_URL: targetUrl },
      spawn: () => { invoked = true; return { status: 0 }; },
    }),
    /MVP_DATABASE_URL is required/,
  );
  assert.equal(invoked, false);
});
