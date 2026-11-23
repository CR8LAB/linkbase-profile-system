import bcrypt from "bcrypt";
import prisma from "../config/prisma.js";
import {
  createOneTimeToken,
  hashOneTimeToken,
  isValidEmail,
  isValidOneTimeToken,
  isValidPassword,
  normalizeEmail,
} from "../services/authSecurity.js";
import { sendCompanyAdminInvitation } from "../services/emailService.js";

const invalidInvitation = "Invitation is invalid or expired";

async function lockCompany(tx, companyId) {
  const [company] = await tx.$queryRaw`
    SELECT "id", "name", "centralisedManagement" FROM "Company"
    WHERE "id" = ${companyId} FOR UPDATE
  `;
  return company;
}

function findAccountConflict(tx, companyId, email) {
  return tx.user.findFirst({
    where: { OR: [{ companyId }, { email: { equals: email, mode: "insensitive" } }] },
    select: { id: true },
  });
}

export function createCompanyAdminInvitationHandlers({
  database = prisma,
  sendInvitation = sendCompanyAdminInvitation,
  hashPassword = (password) => bcrypt.hash(password, 12),
} = {}) {
  async function inviteCompanyAdmin(req, res) {
    const { companyId } = req.params;
    const email = typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "";
    if (!isValidEmail(email)) return res.status(400).json({ message: "A valid email is required" });

    try {
      const result = await database.$transaction(async (tx) => {
        const company = await lockCompany(tx, companyId);
        if (!company) return { status: 404, message: "Company not found" };
        if (!company.centralisedManagement || await findAccountConflict(tx, companyId, email)) {
          return { status: 409, message: "This company or email cannot be invited" };
        }

        const now = new Date();
        const token = createOneTimeToken();
        await tx.companyAdminInvitation.updateMany({ where: { companyId, usedAt: null }, data: { usedAt: now } });
        const invitation = await tx.companyAdminInvitation.create({
          data: {
            companyId,
            email,
            tokenHash: hashOneTimeToken(token),
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
          select: { id: true },
        });
        return { invitationId: invitation.id, token, companyName: company.name };
      });
      if (result.status) return res.status(result.status).json({ message: result.message });

      try {
        await sendInvitation({ email, companyName: result.companyName, token: result.token });
      } catch {
        await database.companyAdminInvitation.updateMany({
          where: { id: result.invitationId, usedAt: null },
          data: { usedAt: new Date() },
        });
        return res.status(503).json({ message: "Invitation email could not be sent" });
      }
      return res.status(202).json({ success: true, message: "Company administrator invitation sent" });
    } catch {
      return res.status(500).json({ message: "Could not send company administrator invitation" });
    }
  }

  async function claimCompanyAdmin(req, res) {
    const { token, password } = req.body || {};
    if (!isValidOneTimeToken(token)) return res.status(400).json({ message: invalidInvitation });
    if (!isValidPassword(password)) {
      return res.status(400).json({ message: "Password must be at least 12 characters and no more than 72 UTF-8 bytes" });
    }

    try {
      const passwordHash = await hashPassword(password);
      const user = await database.$transaction(async (tx) => {
        const invitation = await tx.companyAdminInvitation.findUnique({
          where: { tokenHash: hashOneTimeToken(token) },
        });
        if (!invitation || invitation.usedAt || invitation.expiresAt <= new Date()) return null;
        const { companyId, email } = invitation;
        const company = await lockCompany(tx, companyId);
        if (!company?.centralisedManagement || await findAccountConflict(tx, companyId, email)) return null;

        const now = new Date();
        const consumed = await tx.companyAdminInvitation.updateMany({
          where: { id: invitation.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) return null;
        return tx.user.create({
          data: { email, companyId, passwordHash, role: "COMPANY_ADMIN" },
          select: { id: true, email: true, role: true },
        });
      });
      if (!user) return res.status(400).json({ message: invalidInvitation });
      return res.status(201).json({ success: true, message: "Account created. You can now sign in.", user });
    } catch (error) {
      if (error.code === "P2002") return res.status(400).json({ message: invalidInvitation });
      return res.status(500).json({ message: "Could not create account" });
    }
  }

  return { inviteCompanyAdmin, claimCompanyAdmin };
}

export const { inviteCompanyAdmin, claimCompanyAdmin } = createCompanyAdminInvitationHandlers();
