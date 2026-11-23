import prisma from "../config/prisma.js";
import { lockProfileScope } from "../services/profileAccess.js";
import { canCustomizeProfile, profileAccessSelect, profileManagementWhere } from "../services/profileValidation.js";

async function writeSocialLinks(actor, profileId, write) {
  if (actor.role === "ADMIN") return write(prisma);

  return prisma.$transaction(async (tx) => {
    await lockProfileScope(tx, { id: profileId });
    const allowed = await tx.profile.findUnique({
      where: { id: profileId, AND: profileManagementWhere(actor) },
      select: { id: true },
    });
    if (!allowed) throw Object.assign(new Error("Profile access changed"), { code: "P2025" });
    return write(tx);
  });
}

export async function createSocialLink(req, res) {
  try {
    const { profileId, platform, url, sortOrder } = req.body;

    if (
      typeof profileId !== "string" ||
      !profileId.trim() ||
      typeof platform !== "string" ||
      !platform.trim() ||
      typeof url !== "string" ||
      !url.trim()
    ) {
      return res.status(400).json({
        message: "Profile ID, platform and URL are required",
      });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({
        message: "Please provide a valid URL",
      });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        message: "Only HTTP and HTTPS URLs are allowed",
      });
    }

    if (
      sortOrder !== undefined &&
      (!Number.isInteger(sortOrder) || sortOrder < 0)
    ) {
      return res.status(400).json({
        message: "Sort order must be a non-negative integer",
      });
    }

    // Find the profile
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        ...profileAccessSelect,
      },
    });

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    // Check ownership or administrator access
    if (!canCustomizeProfile(req.user, profile)) {
      return res.status(403).json({
        message: "You cannot manage links for this profile",
      });
    }

    // Create the social link
    const socialLink = await writeSocialLinks(req.user, profileId, (tx) => tx.socialLink.create({
      data: {
        profileId,
        platform,
        url,
        sortOrder: sortOrder ?? 0,
      },
    }));

    return res.status(201).json({
      success: true,
      socialLink,
    });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Profile or link not found" });
    console.error(error);

    return res.status(500).json({
      message: "Failed to create social link",
    });
  }
}

export async function getSocialLinks(req, res) {
  try {
    const { profileId } = req.params;

    const socialLinks = await prisma.socialLink.findMany({
      where: { profileId },
      orderBy: { sortOrder: "asc" },
    });

    return res.status(200).json({
      success: true,
      socialLinks,
    });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Profile or link not found" });
    console.error(error);

    return res.status(500).json({
      message: "Failed to retrieve social links",
    });
  }
}

export async function updateSocialLink(req, res) {
  try {
    const { id } = req.params;
    const { platform, url, sortOrder } = req.body;

    if (
      platform !== undefined &&
      (typeof platform !== "string" || !platform.trim())
    ) {
      return res.status(400).json({
        message: "Platform must be a non-empty text value",
      });
    }

    if (url !== undefined) {
      if (typeof url !== "string" || !url.trim()) {
        return res.status(400).json({
          message: "URL must be a non-empty text value",
        });
      }

      let parsedUrl;

      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({
          message: "Please provide a valid URL",
        });
      }

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return res.status(400).json({
          message: "Only HTTP and HTTPS URLs are allowed",
        });
      }
    }

    if (
      sortOrder !== undefined &&
      (!Number.isInteger(sortOrder) || sortOrder < 0)
    ) {
      return res.status(400).json({
        message: "Sort order must be a non-negative integer",
      });
    }

    // Find the social link and its profile
    const socialLink = await prisma.socialLink.findUnique({
      where: { id },
      include: {
        profile: {
          select: {
            ...profileAccessSelect,
          },
        },
      },
    });

    if (!socialLink) {
      return res.status(404).json({
        message: "Social link not found",
      });
    }

    // Check ownership
    if (
      !canCustomizeProfile(req.user, socialLink.profile)
    ) {
      return res.status(403).json({
        message: "You cannot edit this social link",
      });
    }

    // Only update permitted fields
    const updates = {};

    if (platform !== undefined) updates.platform = platform;
    if (url !== undefined) updates.url = url;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const updatedLink = await writeSocialLinks(req.user, socialLink.profileId, (tx) => tx.socialLink.update({
      where: { id, profileId: socialLink.profileId },
      data: updates,
    }));

    return res.status(200).json({
      success: true,
      socialLink: updatedLink,
    });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Profile or link not found" });
    console.error(error);

    return res.status(500).json({
      message: "Failed to update social link",
    });
  }
}

export async function deleteSocialLink(req, res) {
  try {
    const { id } = req.params;

    if (typeof id !== "string" || !id.trim()) {
      return res.status(400).json({
        message: "Social link ID is required",
      });
    }

    // Find the social link and its profile
    const socialLink = await prisma.socialLink.findUnique({
      where: { id },
      include: {
        profile: {
          select: {
            ...profileAccessSelect,
          },
        },
      },
    });

    if (!socialLink) {
      return res.status(404).json({
        message: "Social link not found",
      });
    }

    // Check ownership
    if (
      !canCustomizeProfile(req.user, socialLink.profile)
    ) {
      return res.status(403).json({
        message: "You cannot delete this social link",
      });
    }

    await writeSocialLinks(req.user, socialLink.profileId, (tx) => tx.socialLink.delete({
      where: { id, profileId: socialLink.profileId },
    }));

    return res.status(200).json({
      success: true,
      message: "Social link deleted successfully",
    });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Profile or link not found" });
    console.error(error);

    return res.status(500).json({
      message: "Failed to delete social link",
    });
  }
}

export async function reorderSocialLinks(req, res) {
  try {
    const { profileId, orderedIds } = req.body;

    if (
      typeof profileId !== "string" ||
      !Array.isArray(orderedIds) ||
      orderedIds.length === 0 ||
      !orderedIds.every((id) => typeof id === "string")
    ) {
      return res.status(400).json({
        message: "Profile ID and ordered link IDs are required",
      });
    }

    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: { id: true, ...profileAccessSelect },
    });

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    if (!canCustomizeProfile(req.user, profile)) {
      return res.status(403).json({
        message: "You cannot reorder links for this profile",
      });
    }

    const links = await prisma.socialLink.findMany({
      where: { profileId },
      select: { id: true },
    });

    const existingIds = links.map((link) => link.id);

    if (
      orderedIds.length !== existingIds.length ||
      new Set(orderedIds).size !== existingIds.length ||
      !orderedIds.every((id) => existingIds.includes(id))
    ) {
      return res.status(400).json({
        message: "The ordered IDs must contain every profile link exactly once",
      });
    }

    const reorder = (tx) => orderedIds.map((id, index) => tx.socialLink.update({
      where: { id, profileId },
      data: { sortOrder: index },
    }));
    if (req.user.role === "ADMIN") await prisma.$transaction(reorder(prisma));
    else await writeSocialLinks(req.user, profileId, (tx) => Promise.all(reorder(tx)));

    return res.status(200).json({
      success: true,
      message: "Social links reordered successfully",
    });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Profile or link not found" });
    console.error(error);

    return res.status(500).json({
      message: "Failed to reorder social links",
    });
  }
}
