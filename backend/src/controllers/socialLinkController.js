import prisma from "../config/prisma.js";

export async function createSocialLink(req, res) {
  try {
    const { profileId, platform, url, sortOrder } = req.body;

    if (!profileId || !platform || !url) {
      return res.status(400).json({
        message: "Profile ID, platform and URL are required",
      });
    }

    // Find the profile
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    // Check ownership or administrator access
    if (req.user.role !== "ADMIN" && profile.userId !== req.user.id) {
      return res.status(403).json({
        message: "You cannot manage links for this profile",
      });
    }

    // Create the social link
    const socialLink = await prisma.socialLink.create({
      data: {
        profileId,
        platform,
        url,
        sortOrder: sortOrder ?? 0,
      },
    });

    return res.status(201).json({
      success: true,
      socialLink,
    });
  } catch (error) {
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

    // Find the social link and its profile
    const socialLink = await prisma.socialLink.findUnique({
      where: { id },
      include: {
        profile: {
          select: {
            userId: true,
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
      req.user.role !== "ADMIN" &&
      socialLink.profile.userId !== req.user.id
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

    const updatedLink = await prisma.socialLink.update({
      where: { id },
      data: updates,
    });

    return res.status(200).json({
      success: true,
      socialLink: updatedLink,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update social link",
    });
  }
}

export async function deleteSocialLink(req, res) {
  try {
    const { id } = req.params;

    // Find the social link and its profile
    const socialLink = await prisma.socialLink.findUnique({
      where: { id },
      include: {
        profile: {
          select: {
            userId: true,
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
      req.user.role !== "ADMIN" &&
      socialLink.profile.userId !== req.user.id
    ) {
      return res.status(403).json({
        message: "You cannot delete this social link",
      });
    }

    await prisma.socialLink.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: "Social link deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to delete social link",
    });
  }
}
