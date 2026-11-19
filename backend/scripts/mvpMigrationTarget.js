const APPROVED_HOST = "ep-long-pine-b46ow0c0.c-6.us-east-2.aws.neon.tech";
const APPROVED_DATABASE = "neondb";
const ALLOWED_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

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

  const sslModes = url.searchParams.getAll("sslmode");
  if (
    sslModes.length !== 1 ||
    !ALLOWED_SSL_MODES.has(sslModes[0].toLowerCase())
  ) {
    throw new Error("Prisma migrations require sslmode=require or stricter");
  }

  return {
    hostname: APPROVED_HOST,
    databaseName: APPROVED_DATABASE,
    sslMode: sslModes[0].toLowerCase(),
  };
}
