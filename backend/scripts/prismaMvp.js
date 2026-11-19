import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { validateMvpMigrationTarget } from "./mvpMigrationTarget.js";

const [command, action, ...extraArgs] = process.argv.slice(2);
if (
  command !== "migrate" ||
  !["status", "deploy"].includes(action) ||
  extraArgs.length > 0
) {
  console.error("Only Prisma migrate status and migrate deploy are allowed through this wrapper.");
  process.exitCode = 1;
} else {
  try {
    validateMvpMigrationTarget(process.env.MVP_DATABASE_URL);
    const require = createRequire(import.meta.url);
    const prismaCli = require.resolve("prisma/build/index.js");
    const result = spawnSync(
      process.execPath,
      [prismaCli, command, action],
      {
        stdio: "inherit",
        env: { ...process.env, PRISMA_MVP_TARGET: "1" },
      },
    );

    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
