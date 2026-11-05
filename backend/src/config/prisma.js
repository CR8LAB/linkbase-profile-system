import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.MVP_DATABASE_URL?.trim();

if (!connectionString) {
  throw new Error("MVP_DATABASE_URL is required for the application runtime");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

export default prisma;
