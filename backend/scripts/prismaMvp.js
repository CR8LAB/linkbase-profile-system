import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

if (!process.env.MVP_DATABASE_URL?.trim()) {
  console.error("MVP_DATABASE_URL is required; DATABASE_URL will not be used.");
  process.exitCode = 1;
} else {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  const result = spawnSync(
    process.execPath,
    [prismaCli, ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, PRISMA_MVP_TARGET: "1" },
    },
  );

  process.exitCode = result.status ?? 1;
}
