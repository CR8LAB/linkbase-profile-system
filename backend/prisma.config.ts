import "dotenv/config";
import { defineConfig, env } from "prisma/config";
import { confirmMvpMigrationTarget } from "./scripts/mvpMigrationTarget.js";

const args = process.argv.slice(2);
// Plain client generation reads only the schema. TypedSQL generation needs a database.
const isClientGeneration = args[0] === "generate" && !args.includes("--sql");
const requiresMvpTarget =
  args.includes("migrate") || process.env.PRISMA_MVP_TARGET === "1";

let datasource;
if (!isClientGeneration) {
  if (requiresMvpTarget && args.some((arg) => /^--(?:from-|to-)?url(?:=|$)/.test(arg))) {
    throw new Error("Prisma MVP commands reject command-line database URL overrides");
  }
  const url = env(requiresMvpTarget ? "MVP_DATABASE_URL" : "DATABASE_URL");
  if (requiresMvpTarget) confirmMvpMigrationTarget(url);
  datasource = { url };
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource,
});
