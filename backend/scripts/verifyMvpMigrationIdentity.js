import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { validateMvpMigrationTarget } from "./mvpMigrationTarget.js";

export async function verifyMvpMigrationIdentity(connectionString, createClient = (config) => new pg.Client(config)) {
  const target = validateMvpMigrationTarget(connectionString);
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error("Unsafe TLS environment");
  const url = new URL(connectionString.trim());
  if (!url.username || !url.password) throw new Error("Missing PostgreSQL connection credentials");
  const enableChannelBinding = url.searchParams.has("channel_binding");
  // Configure TLS explicitly for this probe so URL options cannot override it.
  url.search = "";
  const client = createClient({
    connectionString: url.href,
    ssl: { rejectUnauthorized: true, servername: target.hostname },
    enableChannelBinding,
    connectionTimeoutMillis: 7000,
    query_timeout: 5000,
  });

  try {
    await client.connect();
    const stream = client.connection.stream;
    if (stream?.encrypted !== true || stream.authorized !== true) {
      throw new Error("Neon identity check requires verified TLS");
    }
    await client.query("BEGIN READ ONLY");
    const { rows: [identity] } = await client.query(`SELECT current_database() AS database,
      current_setting('transaction_read_only') AS read_only,
      current_setting('neon.project_id', true) AS project_id,
      current_setting('neon.branch_id', true) AS branch_id,
      current_setting('neon.endpoint_id', true) AS endpoint_id`);
    if (identity?.read_only !== "on" || identity.database !== target.databaseName ||
      identity.project_id !== target.projectId || identity.branch_id !== target.branchId ||
      identity.endpoint_id !== target.endpointId) {
      throw new Error("Neon database identity does not match the approved migration target");
    }
    await client.query("ROLLBACK");
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verifyMvpMigrationIdentity(process.env.MVP_DATABASE_URL);
  } catch {
    // Driver errors can contain connection information.
    process.exitCode = 1;
  }
}
