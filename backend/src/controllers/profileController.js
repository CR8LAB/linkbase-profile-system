import prisma from "../config/prisma.js";
import { bucket } from "../config/storage.js";
import { randomUUID } from "node:crypto";
import {
  canCustomizeProfile,
  validateProfileCustomization,
} from "../services/profileValidation.js";

export async function createProfile(req, res) {
  try {
    const {
      publicId,
      fullName,
      companyId,
      jobTitle,
      email,
      phone,
      websiteUrl,
      photoUrl,
      logoUrl,
      fontFamily,
      buttonColor,
      backgroundColor,
      buttonTextColor,
    } = req.body;

    if (
      typeof publicId !== "string" ||
      !publicId.trim() ||
      typeof fullName !== "string" ||
      !fullName.trim() ||
      typeof companyId !== "string" ||
      !companyId.trim()
    ) {
      return res.status(400).json({
        message: "Public ID, full name and company ID are required",
      });
    }

    const validation = validateProfileCustomization({
      fullName,
      jobTitle,
      email,
      phone,
      websiteUrl,
      fontFamily,
      buttonColor,
      backgroundColor,
      buttonTextColor,
    });

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const profile = await prisma.profile.create({
      data: {
        publicId: publicId.trim(),
        companyId: companyId.trim(),
        ...validation.updates,
        photoUrl,
        logoUrl,
      },
    });

    return res.status(201).json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to create profile",
    });
  }
}

// updating the profile

export async function updateProfile(req, res) {
  try {
    const { publicId } = req.params;
    const body = req.body || {};
    const existing = await prisma.profile.findUnique({
      where: { publicId },
      select: { userId: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (!canCustomizeProfile(req.user, existing)) {
      return res.status(403).json({ message: "You cannot edit this profile" });
    }

    const validation = validateProfileCustomization(body);
    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const updates = { ...validation.updates };

    if (Object.hasOwn(body, "companyId")) {
      if (req.user.role !== "ADMIN") {
        return res
          .status(403)
          .json({ message: "Only administrators can change the company" });
      }
      if (typeof body.companyId !== "string" || !body.companyId.trim()) {
        return res
          .status(400)
          .json({ message: "A valid company ID is required" });
      }
      updates.companyId = body.companyId.trim();
    }

    const profile = await prisma.profile.update({
      where: { publicId },
      data: updates,
      select: {
        publicId: true,
        fullName: true,
        email: true,
        phone: true,
        jobTitle: true,
        websiteUrl: true,
        photoUrl: true,
        logoUrl: true,
        fontFamily: true,
        buttonColor: true,
        backgroundColor: true,
        buttonTextColor: true,
        companyId: true,
      },
    });

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update profile",
    });
  }
}

///////////////////////////////////////////////////

export async function getProfile(req, res) {
  try {
    const { publicId } = req.params;

    const profile = await prisma.profile.findUnique({
      where: { publicId },
      select: {
        publicId: true,
        fullName: true,
        jobTitle: true,
        email: true,
        phone: true,
        websiteUrl: true,
        photoUrl: true,
        logoUrl: true,
        fontFamily: true,
        buttonColor: true,
        backgroundColor: true,
        buttonTextColor: true,
        socialLinks: {
          select: {
            id: true,
            platform: true,
            url: true,
            sortOrder: true,
          },
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to retrieve profile",
    });
  }
}

////////////////////////////////////////

export async function getMyProfile(req, res) {
  try {
    const profile = await prisma.profile.findFirst({
      where: {
        userId: req.user.id,
      },
      select: {
        id: true,
        publicId: true,
        fullName: true,
        jobTitle: true,
        email: true,
        phone: true,
        websiteUrl: true,
        photoUrl: true,
        logoUrl: true,
        fontFamily: true,
        buttonColor: true,
        backgroundColor: true,
        buttonTextColor: true,
        socialLinks: {
          select: {
            id: true,
            platform: true,
            url: true,
            sortOrder: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({
        message: "No profile has been assigned to your account",
      });
    }

    return res.status(200).json({
      success: true,
      profile,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to retrieve your profile",
    });
  }
}

///////////////
export async function getCompanyProfiles(req, res) {
  try {
    const { companyId } = req.params;

    const profiles = await prisma.profile.findMany({
      where: {
        companyId,
      },
      select: {
        publicId: true,
        fullName: true,
        jobTitle: true,
        email: true,
        phone: true,
        photoUrl: true,

        user: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      profiles,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to retrieve company profiles",
    });
  }
}

//////////////////////////

export async function assignProfile(req, res) {
  try {
    const { publicId } = req.params;
    const { userId } = req.body;

    if (typeof userId !== "string" || !userId.trim()) {
      return res.status(400).json({
        message: "User ID is required",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.role !== "CUSTOMER") {
      return res.status(400).json({
        message: "Valid customer account required",
      });
    }

    const profile = await prisma.profile.findUnique({
      where: { publicId },
    });

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    if (profile.userId && profile.userId !== userId) {
      return res.status(409).json({
        message: "Profile is already assigned to another customer",
      });
    }

    const alreadyAssignedProfile = await prisma.profile.findFirst({
      where: { userId },
      select: { publicId: true },
    });

    if (
      alreadyAssignedProfile &&
      alreadyAssignedProfile.publicId !== publicId
    ) {
      return res.status(409).json({
        message: "Customer is already assigned to another profile",
      });
    }

    const updatedProfile = await prisma.profile.update({
      where: { publicId },
      data: { userId },
      select: {
        publicId: true,
        fullName: true,
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    return res.status(200).json(updatedProfile);
  } catch (error) {
    console.error(error);

    if (error.code === "P2002") {
      return res.status(409).json({
        message: "Customer is already assigned to another profile",
      });
    }

    return res.status(500).json({
      message: "Failed to assign profile",
    });
  }
}

///////////////////

export async function updateMyProfile(req, res) {
  return updateProfile(req, res);
}

async function uploadProfileImage(req, res, imageField) {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "Please select an image",
      });
    }

    const { publicId } = req.params;

    // Find the profile
    const profile = await prisma.profile.findUnique({
      where: { publicId },
    });

    if (!profile) {
      return res.status(404).json({
        message: "Profile not found",
      });
    }

    // Verify ownership
    if (!canCustomizeProfile(req.user, profile)) {
      return res.status(403).json({
        message: "You cannot upload an image to this profile",
      });
    }

    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };

    const extension = extensions[req.file.mimetype];
    const fileName =
      imageField === "photoUrl"
        ? `profiles/${publicId}/${randomUUID()}.${extension}`
        : `profiles/${publicId}/logos/${randomUUID()}.${extension}`;

    const file = bucket.file(fileName);

    await file.save(req.file.buffer, {
      resumable: false,
      metadata: {
        contentType: req.file.mimetype,
        cacheControl: "public, max-age=31536000",
      },
    });

    const photoUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    const updatedProfile = await prisma.profile.update({
      where: { publicId },
      data: { [imageField]: photoUrl },
      select: {
        publicId: true,
        fullName: true,
        [imageField]: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("Profile image upload error:", error);

    return res.status(500).json({
      message: "Failed to upload profile image",
    });
  }
}

export async function uploadMyPhoto(req, res) {
  return uploadProfileImage(req, res, "photoUrl");
}

export async function uploadProfileLogo(req, res) {
  return uploadProfileImage(req, res, "logoUrl");
}
