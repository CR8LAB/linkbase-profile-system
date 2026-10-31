import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../src/config/prisma.js";

async function createAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password || password.length < 12) {
      throw new Error("Valid ADMIN_EMAIL and ADMIN_PASSWORD are required");
    }

    const existingAdmin = await prisma.user.findUnique({
      where: { email },
    });

    if (existingAdmin) {
      console.log("An account with this email already exists");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "ADMIN",
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    console.log("Administrator created:", admin);
  } catch (error) {
    console.error("Administrator setup failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
