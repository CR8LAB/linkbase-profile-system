import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const datasourceUrl =
  process.env.PRISMA_MVP_TARGET === "1"
    ? env("MVP_DATABASE_URL")
    : env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
