import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTestMigrationArguments, validateTestMigrationTarget } from "./testMigrationTarget.js";

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testConfigPath = path.join(backendDirectory, "prisma.test.config.ts");

function redactOutput(value, targetUrl) {
  let output = String(value || "");
  output = output.replaceAll(targetUrl.href, "[test database URL redacted]");
  for (const credential of [targetUrl.username, targetUrl.password]) {
    if (!credential) continue;
    const forms = new Set([credential]);
    try {
      forms.add(decodeURIComponent(credential));
    } catch {
      // Keep the encoded form only; malformed escapes are still redacted below.
    }
    for (const form of forms) {
      if (form) output = output.replaceAll(form, "[redacted]");
    }
  }
  return output.replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[PostgreSQL connection URL redacted]");
}

export function executeTestMigration({ args, env, spawn = spawnSync, prismaCliPath }) {
  const [command, action] = validateTestMigrationArguments(args);
  const targetUrl = validateTestMigrationTarget(env.LINKBASE_TEST_DATABASE_URL);
  const childEnvironment = { ...env, LINKBASE_TEST_DATABASE_URL: targetUrl.href };
  delete childEnvironment.MVP_DATABASE_URL;
  delete childEnvironment.DATABASE_URL;
  delete childEnvironment.PRISMA_MVP_TARGET;
  delete childEnvironment.NODE_TLS_REJECT_UNAUTHORIZED;
  delete childEnvironment.NODE_OPTIONS;
  delete childEnvironment.NODE_EXTRA_CA_CERTS;
  delete childEnvironment.SSL_CERT_FILE;
  delete childEnvironment.SSL_CERT_DIR;
  delete childEnvironment.CURL_CA_BUNDLE;
  delete childEnvironment.REQUESTS_CA_BUNDLE;
  for (const key of Object.keys(childEnvironment)) {
    if (key.toUpperCase().startsWith("PG")) delete childEnvironment[key];
  }

  const cliPath = prismaCliPath || createRequire(import.meta.url).resolve("prisma/build/index.js");
  const result = spawn(
    process.execPath,
    [cliPath, command, action, "--config", testConfigPath],
    { cwd: backendDirectory, env: childEnvironment, encoding: "utf8" },
  );

  return {
    status: result.status ?? 1,
    stdout: redactOutput(result.stdout, targetUrl),
    stderr: redactOutput(result.stderr || result.error?.message, targetUrl),
  };
}

function isMainModule() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  try {
    const result = executeTestMigration({ args: process.argv.slice(2), env: process.env });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = result.status;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
