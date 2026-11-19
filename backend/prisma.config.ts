import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { validateMvpMigrationTarget } from "./scripts/mvpMigrationTarget.js";

const isMigrationCommand = process.argv.includes("migrate");
const requiresMvpTarget =
  isMigrationCommand || process.env.PRISMA_MVP_TARGET === "1";

let datasourceUrl;
if (requiresMvpTarget) {
  const mvpDatabaseUrl = env("MVP_DATABASE_URL");
  validateMvpMigrationTarget(mvpDatabaseUrl);
  datasourceUrl = mvpDatabaseUrl;
} else {
  datasourceUrl = env("DATABASE_URL");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
