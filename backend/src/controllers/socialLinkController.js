import prisma from "../config/prisma.js";

export async function createSocialLink(req, res) {
  try {
    const { profileId, platform, url, sortOrder } = req.body;

    if (!profileId || !platform || !url) {
      return res.status(400).json({
        message: "Profile ID, platform and URL are required",
      });
    }

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

    const updates = {};

    if (platform !== undefined) updates.platform = platform;
    if (url !== undefined) updates.url = url;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const socialLink = await prisma.socialLink.update({
      where: { id },
      data: updates,
    });

    return res.status(200).json({
      success: true,
      socialLink,
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
