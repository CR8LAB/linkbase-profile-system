import prisma from "../config/prisma.js";
import { profileFontFamilies } from "../services/profileValidation.js";
import {
  createCompanyDeletionHandler,
  deleteCompanyWithNoProfiles,
} from "../services/companyDeletion.js";

export const deleteCompany = createCompanyDeletionHandler({
  deleteCompanyIfUnassociated: (companyId) =>
    prisma.$transaction((tx) => deleteCompanyWithNoProfiles(tx, companyId)),
});

export async function createCompany(req, res) {
  try {
    const { name, logoUrl, fontFamily } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        message: "Company name is required",
      });
    }

    if (fontFamily !== undefined && !profileFontFamilies.includes(fontFamily)) {
      return res.status(400).json({ message: "Font family is not supported" });
    }

    const company = await prisma.company.create({
      data: {
        name: name.trim(),
        logoUrl,
        fontFamily,
      },
    });

    return res.status(201).json({
      success: true,
      company,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create company",
    });
  }
}

export async function updateCompany(req, res) {
  const { companyId } = req.params;
  const { name, fontFamily } = req.body || {};

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 120 ||
    !profileFontFamilies.includes(fontFamily)
  ) {
    return res
      .status(400)
      .json({ message: "Valid company name and font are required" });
  }

  try {
    const company = await prisma.company.update({
      where: { id: companyId },
      data: { name: name.trim(), fontFamily },
      select: { id: true, name: true, logoUrl: true, fontFamily: true },
    });

    return res.status(200).json({ success: true, company });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ message: "Company not found" });
    }

    console.error("Company update failed:", error);
    return res.status(500).json({ message: "Failed to update company" });
  }
}

export async function getCompanies(req, res) {
  try {
    const companies = await prisma.company.findMany({
      select: {
        id: true,
        name: true,
        logoUrl: true,
        fontFamily: true,
      },
    });

    return res.status(200).json({
      success: true,
      companies,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to fetch companies",
    });
  }
}
