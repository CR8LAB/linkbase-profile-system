const LOOPBACK_DATABASE_NAME = "linkbase_phase4a_test";
const NEON_DATABASE_NAME = "neondb";
const APPROVED_NEON_HOSTS = new Set([
  "ep-broad-moon-b49xkrbf.c-6.us-east-2.aws.neon.tech",
  "ep-sparkling-tree-b4kpmofz.c-6.us-east-2.aws.neon.tech",
]);
const SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

export function validateTestDatabaseUrl(value) {
  if (!value) return null;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("LINKBASE_TEST_DATABASE_URL must be a valid PostgreSQL test URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("PostgreSQL integration tests require a PostgreSQL URL");
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(host);
  const isApprovedNeon = APPROVED_NEON_HOSTS.has(host);
  if (!isLoopback && !isApprovedNeon) {
    throw new Error("PostgreSQL integration tests reject unapproved database hosts");
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error("PostgreSQL integration tests require the dedicated test database name");
  }
  const requiredDatabaseName = isApprovedNeon
    ? NEON_DATABASE_NAME
    : LOOPBACK_DATABASE_NAME;
  if (databaseName !== requiredDatabaseName) {
    throw new Error(`Configured database name does not match required ${requiredDatabaseName} for this approved host; refusing connection`);
  }

  const sslModes = url.searchParams.getAll("sslmode");
  if (sslModes.length !== 1 || !SSL_MODES.has(sslModes[0].toLowerCase())) {
    throw new Error("PostgreSQL integration tests require sslmode=require or stricter");
  }
  if (isApprovedNeon && url.port && url.port !== "5432") {
    throw new Error("PostgreSQL integration tests reject unexpected Neon ports");
  }

  return url;
}
