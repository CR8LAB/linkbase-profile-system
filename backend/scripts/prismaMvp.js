import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateMvpMigrationTarget } from "./mvpMigrationTarget.js";

const ALLOWED_ENV_VALUE = /(?:SECRET|PASSWORD|PASSWD|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|CREDENTIAL|DATABASE_URL|MVP_DATABASE_URL|LINKBASE_TEST_DATABASE_URL|SMTP|GCS|JWT|GOOGLE|AWS)/i;

export function redactPrismaOutput(value, env, targetUrl) {
  let output = String(value ?? "");
  const sensitiveValues = new Set();

  if (targetUrl) {
    sensitiveValues.add(targetUrl.href);
    for (const credential of [targetUrl.username, targetUrl.password]) {
      if (!credential) continue;
      sensitiveValues.add(credential);
      try {
        sensitiveValues.add(decodeURIComponent(credential));
      } catch {
        // The encoded credential is still covered by the full URL redaction.
      }
    }
  }

  for (const [name, secret] of Object.entries(env ?? {})) {
    if (ALLOWED_ENV_VALUE.test(name) && typeof secret === "string" && secret.length >= 4) {
      sensitiveValues.add(secret);
    }
  }

  for (const secret of [...sensitiveValues].filter(Boolean).sort((a, b) => b.length - a.length)) {
    output = output.replaceAll(secret, "[REDACTED]");
  }

  output = output.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[PostgreSQL connection URL redacted]");
  output = output.replace(/((?:MVP_DATABASE_URL|DATABASE_URL|LINKBASE_TEST_DATABASE_URL)\s*[=:]\s*)[^\s,;"']+/gi, "$1[REDACTED]");
  output = output.replace(/((?:password|passwd|secret|token|api[_-]?key|sslpassword)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi, "$1[REDACTED]");
  return output;
}

export function executeMvpMigration({ args, env, spawn = spawnSync, prismaCliPath }) {
  const [command, action, ...extraArgs] = args;
  if (command !== "migrate" || !["status", "deploy"].includes(action) || extraArgs.length > 0) {
    throw new Error("Only Prisma migrate status and migrate deploy are allowed through this wrapper.");
  }

  validateMvpMigrationTarget(env.MVP_DATABASE_URL);
  const targetUrl = new URL(env.MVP_DATABASE_URL);
  const cliPath = prismaCliPath || createRequire(import.meta.url).resolve("prisma/build/index.js");
  const childEnvironment = {
    ...env,
    PRISMA_MVP_TARGET: "1",
    // These are scoped to the Prisma child process; they do not alter the caller's environment.
    DEBUG: "prisma:engines,prisma:schemaEngine:stderr,prisma:migrate:status",
    RUST_LOG: "debug,quaint=error",
  };
  const result = spawn(
    process.execPath,
    [cliPath, command, action],
    {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      env: childEnvironment,
    },
  );

  return {
    status: result.status ?? 1,
    stdout: redactPrismaOutput(result.stdout, env, targetUrl),
    stderr: redactPrismaOutput(result.stderr || result.error?.message, env, targetUrl),
    processErrorCode: result.error?.code,
  };
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const result = executeMvpMigration({ args: process.argv.slice(2), env: process.env });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.processErrorCode) {
      process.stderr.write(`Prisma CLI process error code: ${result.processErrorCode}\n`);
    }
    process.exitCode = result.status;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
