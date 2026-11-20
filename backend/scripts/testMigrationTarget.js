import path from "node:path";
import { APPROVED_NEON_HOSTS, validateTestDatabaseUrl } from "../tests/databaseIntegrityGuard.js";

const REQUIRED_DATABASE = "neondb";
const REQUIRED_SSL_MODE = "verify-full";
const ALLOWED_QUERY_PARAMETERS = new Set(["sslmode", "channel_binding"]);

export function validateTestMigrationTarget(connectionString) {
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new Error("LINKBASE_TEST_DATABASE_URL is required for test migrations");
  }

  const url = validateTestDatabaseUrl(connectionString);
  if (!url) {
    throw new Error("LINKBASE_TEST_DATABASE_URL is required for test migrations");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!APPROVED_NEON_HOSTS.includes(host)) {
    throw new Error("Test migrations require an exact allowlisted Neon test host");
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("Test migrations require the approved test database name");
  }
  if (databaseName !== REQUIRED_DATABASE || url.pathname.slice(1).includes("/")) {
    throw new Error("Test migrations require database neondb");
  }

  if (url.port && url.port !== "5432") {
    throw new Error("Test migrations reject unapproved database ports");
  }
  if (!url.username || !url.password || url.hash) {
    throw new Error("Test migrations require credentials in the guarded PostgreSQL URL");
  }

  const sslModes = url.searchParams.getAll("sslmode");
  if (sslModes.length !== 1 || sslModes[0].toLowerCase() !== REQUIRED_SSL_MODE) {
    throw new Error("Test migrations require sslmode=verify-full");
  }

  for (const key of url.searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMETERS.has(key.toLowerCase())) {
      throw new Error("Test migrations reject unapproved connection options");
    }
  }
  const channelBinding = url.searchParams.getAll("channel_binding");
  if (channelBinding.length > 1 || channelBinding.some((value) => value.toLowerCase() !== "require")) {
    throw new Error("Test migrations reject unapproved channel binding options");
  }

  return url;
}

export function validateTestMigrationArguments(args, expectedConfigPath) {
  const [command, action, ...extraArgs] = args;
  const hasOnlyPinnedConfig =
    extraArgs.length === 2 &&
    extraArgs[0] === "--config" &&
    expectedConfigPath &&
    path.resolve(extraArgs[1]) === path.resolve(expectedConfigPath);
  if (
    command !== "migrate" ||
    !["status", "deploy"].includes(action) ||
    (extraArgs.length > 0 && !hasOnlyPinnedConfig)
  ) {
    throw new Error("Only Prisma migrate status and migrate deploy are allowed through the test migration wrapper");
  }
  return [command, action];
}

export function createTestPrismaConfig(connectionString) {
  const url = validateTestMigrationTarget(connectionString);
  return {
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    datasource: { url: url.href },
  };
}
