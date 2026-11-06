import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";
import {
  createOneTimeToken,
  emailsMatch,
  hashOneTimeToken,
  isValidEmail,
  isValidOneTimeToken,
  isValidPassword,
  normalizeEmail,
} from "../services/authSecurity.js";
import {
  sendClaimInvitation,
  sendPasswordResetEmail,
} from "../services/emailService.js";

const resetRequestMessage =
  "If an account matches that email, password reset instructions will be sent.";

export async function inviteProfileClaim(req, res) {
  const { publicId } = req.params;
  const { email } = req.body || {};

  if (typeof publicId !== "string" || !isValidEmail(email)) {
    return res.status(400).json({ message: "A valid email is required" });
  }

  const normalizedEmail = normalizeEmail(email);

  try {
    const invitation = await prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({
        where: { publicId },
        select: { id: true, fullName: true, email: true, userId: true },
      });

      if (!profile) throw new Error("PROFILE_NOT_FOUND");
      if (profile.userId) throw new Error("PROFILE_ALREADY_CLAIMED");
      if (!emailsMatch(profile.email, normalizedEmail)) {
        throw new Error("PROFILE_EMAIL_MISMATCH");
      }

      const existingUser = await tx.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (existingUser) throw new Error("ACCOUNT_ALREADY_EXISTS");

      const now = new Date();
      const token = createOneTimeToken();

      await tx.profileClaimToken.updateMany({
        where: { profileId: profile.id, usedAt: null },
        data: { usedAt: now },
      });

      const claimToken = await tx.profileClaimToken.create({
        data: {
          tokenHash: hashOneTimeToken(token),
          email: normalizedEmail,
          profileId: profile.id,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });

      return { claimToken, token, fullName: profile.fullName };
    });

    try {
      await sendClaimInvitation({
        email: normalizedEmail,
        fullName: invitation.fullName,
        token: invitation.token,
      });
    } catch (error) {
      await prisma.profileClaimToken.update({
        where: { id: invitation.claimToken.id },
        data: { usedAt: new Date() },
      });
      console.error("Claim invitation email could not be sent:", error.message);

      return res.status(503).json({
        message: "Invitation email could not be sent. Please try again later.",
      });
    }

    return res.status(202).json({
      success: true,
      message: "Profile claim invitation sent",
    });
  } catch (error) {
    if (error.message === "PROFILE_NOT_FOUND") {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (error.message === "PROFILE_EMAIL_MISMATCH") {
      return res.status(400).json({
        message: "Invitation email must match the email assigned to the profile",
      });
    }

    if (
      ["PROFILE_ALREADY_CLAIMED", "ACCOUNT_ALREADY_EXISTS"].includes(
        error.message,
      )
    ) {
      return res.status(409).json({
        message: "This profile or email cannot be invited",
      });
    }

    console.error("Claim invitation failed:", error);
    return res.status(500).json({ message: "Could not send invitation" });
  }
}

export async function claimProfile(req, res) {
  const { token, password } = req.body || {};

  if (!isValidOneTimeToken(token)) {
    return res
      .status(400)
      .json({ message: "Invitation is invalid or expired" });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 12 characters and no more than 72 UTF-8 bytes",
    });
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const claimToken = await tx.profileClaimToken.findUnique({
        where: { tokenHash: hashOneTimeToken(token) },
      });

      if (!claimToken || claimToken.usedAt || claimToken.expiresAt <= now) {
        throw new Error("INVALID_CLAIM_TOKEN");
      }

      const profile = await tx.profile.findUnique({
        where: { id: claimToken.profileId },
        select: { email: true },
      });

      if (!profile || !emailsMatch(profile.email, claimToken.email)) {
        throw new Error("INVALID_CLAIM_TOKEN");
      }

      const consumed = await tx.profileClaimToken.updateMany({
        where: {
          id: claimToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) throw new Error("INVALID_CLAIM_TOKEN");

      const user = await tx.user.create({
        data: {
          email: claimToken.email,
          passwordHash,
          role: "CUSTOMER",
        },
        select: { id: true, email: true, role: true },
      });

      const assigned = await tx.profile.updateMany({
        where: { id: claimToken.profileId, userId: null },
        data: { userId: user.id },
      });

      if (assigned.count !== 1) throw new Error("INVALID_CLAIM_TOKEN");

      await tx.profileClaimToken.updateMany({
        where: { profileId: claimToken.profileId, usedAt: null },
        data: { usedAt: now },
      });

      return user;
    });

    return res.status(201).json({
      success: true,
      message: "Account created. You can now sign in.",
      user,
    });
  } catch (error) {
    if (error.message === "INVALID_CLAIM_TOKEN" || error.code === "P2002") {
      return res
        .status(400)
        .json({ message: "Invitation is invalid or expired" });
    }

    console.error("Profile claim failed:", error);
    return res.status(500).json({ message: "Could not create account" });
  }
}

export async function requestPasswordReset(req, res) {
  const { email } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ message: "Enter a valid email address" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: { id: true, email: true },
    });

    if (user) {
      const now = new Date();
      const token = createOneTimeToken();
      const resetToken = await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        });

        return tx.passwordResetToken.create({
          data: {
            tokenHash: hashOneTimeToken(token),
            userId: user.id,
            expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
          },
        });
      });

      try {
        await sendPasswordResetEmail({ email: user.email, token });
      } catch (error) {
        await prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { usedAt: new Date() },
        });
        console.error("Password reset email could not be sent:", error.message);
      }
    }
  } catch (error) {
    console.error("Password reset request failed:", error);
  }

  return res.status(202).json({ success: true, message: resetRequestMessage });
}

export async function completePasswordReset(req, res) {
  const { token, password } = req.body || {};

  if (!isValidOneTimeToken(token)) {
    return res
      .status(400)
      .json({ message: "Reset link is invalid or expired" });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({
      message:
        "Password must be at least 12 characters and no more than 72 UTF-8 bytes",
    });
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.$transaction(async (tx) => {
      const resetToken = await tx.passwordResetToken.findUnique({
        where: { tokenHash: hashOneTimeToken(token) },
      });

      if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
        throw new Error("INVALID_RESET_TOKEN");
      }

      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (consumed.count !== 1) throw new Error("INVALID_RESET_TOKEN");

      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: now },
      });
    });

    return res.status(200).json({
      success: true,
      message: "Password updated. You can now sign in.",
    });
  } catch (error) {
    if (error.message === "INVALID_RESET_TOKEN") {
      return res
        .status(400)
        .json({ message: "Reset link is invalid or expired" });
    }

    console.error("Password reset completion failed:", error);
    return res.status(500).json({ message: "Could not update password" });
  }
}

export async function createUser(req, res) {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      password.length < 12
    ) {
      return res.status(400).json({
        message:
          "A valid email and password of at least 12 characters are required",
      });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email is already registered",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
        passwordHash,
        role: "CUSTOMER",
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    return res.status(201).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create user",
    });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        email: email.trim().toLowerCase(),
      },
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
        algorithm: "HS256",
      },
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login failed:", error);

    return res.status(500).json({
      message: "Login failed",
    });
  }
}
