import prisma from "../config/prisma.js";
import { bucket } from "../config/storage.js";
import { removeProfileMedia } from "../services/profilePdf.js";

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

export async function deleteAdminProfile(req, res) {
  const { publicId } = req.params;

  try {
    const profile = await prisma.profile.findUnique({
      where: { publicId },
      select: { id: true, publicId: true, photoUrl: true, pdfUrl: true },
    });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }

    // Remove only media URLs that match this profile's generated GCS object paths.
    // If storage cleanup fails, retain the database row and report the failure.
    await removeProfileMedia({ bucket, profile });
    await prisma.profile.delete({ where: { id: profile.id } });

    return res.status(200).json({
      success: true,
      message: "Profile deleted successfully",
    });
  } catch (error) {
    console.error("Admin profile deletion failed:", error);
    return res.status(500).json({
      message: "Could not fully delete the profile. Please retry or contact support.",
    });
  }
}
