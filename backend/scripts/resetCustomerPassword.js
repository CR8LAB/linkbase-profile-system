import "dotenv/config";
import bcrypt from "bcrypt";
import prisma from "../src/config/prisma.js";

async function resetPassword() {
  try {
    const email = process.env.RESET_USER_EMAIL?.trim().toLowerCase();
    const password = process.env.RESET_USER_PASSWORD;

    if (!email || !password || password.length < 12) {
      throw new Error(
        "Valid email and password of at least 12 characters required",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.role !== "CUSTOMER") {
      throw new Error("Customer account not found");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    console.log("Customer password updated successfully");
  } catch (error) {
    console.error(error.message);
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();
