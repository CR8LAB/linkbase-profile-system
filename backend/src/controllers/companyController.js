import prisma from "../config/prisma.js";

export async function createCompany(req, res) {
  try {
    const { name, logoUrl, fontFamily } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        message: "Company name is required",
      });
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
