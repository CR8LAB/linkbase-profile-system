import prisma from "../config/prisma.js";

export async function getAdminSummary(req, res) {
  try {
    const [totalProfiles, companies, customers, unassignedProfiles] =
      await Promise.all([
        prisma.profile.count(),
        prisma.company.count(),
        prisma.user.count({ where: { role: "CUSTOMER" } }),
        prisma.profile.count({ where: { userId: null } }),
      ]);

    return res.status(200).json({
      success: true,
      summary: { totalProfiles, companies, customers, unassignedProfiles },
    });
  } catch (error) {
    console.error("Admin summary failed:", error);
    return res.status(500).json({ message: "Failed to load dashboard data" });
  }
}

export async function getCustomers(req, res) {
  try {
    const customers = await prisma.user.findMany({
      where: { role: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        createdAt: true,
        profiles: {
          select: { publicId: true, fullName: true },
        },
      },
    });

    return res.status(200).json({ success: true, customers });
  } catch (error) {
    console.error("Customer list failed:", error);
    return res.status(500).json({ message: "Failed to load customers" });
  }
}

export async function getAdminProfiles(req, res) {
  try {
    const profiles = await prisma.profile.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        publicId: true,
        fullName: true,
        company: { select: { id: true, name: true } },
        user: { select: { id: true, email: true } },
      },
    });

    return res.status(200).json({ success: true, profiles });
  } catch (error) {
    console.error("Admin profile list failed:", error);
    return res.status(500).json({ message: "Failed to load profiles" });
  }
}
