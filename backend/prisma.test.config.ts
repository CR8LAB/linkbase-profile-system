import { defineConfig } from "prisma/config";
import { fileURLToPath } from "node:url";
import {
  createTestPrismaConfig,
  validateTestMigrationArguments,
} from "./scripts/testMigrationTarget.js";

validateTestMigrationArguments(process.argv.slice(2), fileURLToPath(import.meta.url));

export default defineConfig(
  createTestPrismaConfig(process.env.LINKBASE_TEST_DATABASE_URL),
);
