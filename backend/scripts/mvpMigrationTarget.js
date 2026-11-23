import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const APPROVED_ENDPOINT_ID = "ep-dawn-hat-b4oc4nhb";
const APPROVED_HOST = `${APPROVED_ENDPOINT_ID}.c-6.us-east-2.aws.neon.tech`;
const APPROVED_DATABASE = "neondb";
const APPROVED_PROJECT_ID = "steep-term-83008496";
const APPROVED_BRANCH_ID = "br-fragrant-cell-b4qjew0b";
const REQUIRED_SSL_MODE = "require";
const REQUIRED_SSL_ACCEPT_MODE = "strict";

export function validateMvpMigrationTarget(connectionString) {
  if (typeof connectionString !== "string" || !connectionString.trim()) {
    throw new Error("MVP_DATABASE_URL is required for Prisma migrations");
  }

  let url;
  try {
    url = new URL(connectionString.trim());
  } catch {
    throw new Error("MVP_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("Prisma migrations require a PostgreSQL URL");
  }

  if (url.hostname.toLowerCase() !== APPROVED_HOST) {
    throw new Error("Prisma migrations reject unapproved database hosts");
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("Prisma migrations require the approved database name");
  }
  if (databaseName !== APPROVED_DATABASE || url.pathname.slice(1).includes("/")) {
    throw new Error("Prisma migrations reject unapproved database names");
  }

  if (url.port && url.port !== "5432") {
    throw new Error("Prisma migrations reject unapproved database ports");
  }
  if (url.hash) throw new Error("Prisma migrations reject connection URL fragments");

  const sslModes = url.searchParams.getAll("sslmode");
  if (
    sslModes.length !== 1 ||
    sslModes[0].toLowerCase() !== REQUIRED_SSL_MODE
  ) {
    throw new Error("Prisma migrations require sslmode=require");
  }

  const sslAcceptModes = url.searchParams.getAll("sslaccept");
  if (
    sslAcceptModes.length !== 1 ||
    sslAcceptModes[0].toLowerCase() !== REQUIRED_SSL_ACCEPT_MODE
  ) {
    throw new Error("Prisma migrations require sslaccept=strict");
  }

  const options = new Set(["sslmode", "sslaccept", "schema", "channel_binding"]);
  for (const key of url.searchParams.keys()) {
    if (!options.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error("Prisma migrations reject unapproved connection parameters");
    }
  }
  if ((url.searchParams.has("schema") && url.searchParams.get("schema") !== "public") ||
      (url.searchParams.has("channel_binding") && url.searchParams.get("channel_binding") !== "require")) {
    throw new Error("Prisma migrations reject unapproved schema or channel binding settings");
  }

  return {
    hostname: APPROVED_HOST,
    databaseName: APPROVED_DATABASE,
    projectId: APPROVED_PROJECT_ID,
    branchId: APPROVED_BRANCH_ID,
    endpointId: APPROVED_ENDPOINT_ID,
    sslMode: REQUIRED_SSL_MODE,
    sslAcceptMode: REQUIRED_SSL_ACCEPT_MODE,
  };
}

// Prisma loads this config before starting its engine. Keep the preflight
// synchronous here so direct Prisma CLI invocations also check live identity.
export function confirmMvpMigrationTarget(connectionString) {
  validateMvpMigrationTarget(connectionString);
  const verifier = fileURLToPath(new URL("./verifyMvpMigrationIdentity.js", import.meta.url));
  const result = spawnSync(process.execPath, [verifier], {
    env: { ...process.env, MVP_DATABASE_URL: connectionString },
    stdio: "ignore",
    timeout: 15000,
    windowsHide: true,
  });
  if (result.status !== 0 || result.error) {
    throw new Error("Prisma migrations could not verify the approved Neon project, branch, endpoint and database over TLS");
  }
}
