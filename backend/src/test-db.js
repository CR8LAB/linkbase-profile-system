import prisma from "./config/prisma.js";

async function testDatabase() {
  try {
    const companies = await prisma.company.findMany();

    console.log("Database connected successfully!");
    console.log("Companies:", companies);
  } catch (error) {
    console.error("Database connection failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
