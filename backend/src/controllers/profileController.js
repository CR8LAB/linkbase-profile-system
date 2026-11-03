import prisma from "../config/prisma.js";
import { bucket } from "../config/storage.js";
import { randomUUID } from "node:crypto";

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
    } = req.body;

    if (!publicId || !fullName || !companyId) {
      return res.status(400).json({
        message: "Public ID, full name and company ID are required",
      });
    }

    const profile = await prisma.profile.create({
      data: {
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

    const allowedFields = [
      "fullName",
      "email",
      "phone",
      "jobTitle",
      "websiteUrl",
      "photoUrl",
      "logoUrl",
      "fontFamily",
      "buttonColor",
      "companyId",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (Object.hasOwn(req.body, field)) {
        updates[field] = req.body[field];
      }
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

    return res.status(500).json({
      message: "Failed to assign profile",
    });
  }
}

///////////////////

export async function updateMyProfile(req, res) {
  try {
    const { fullName, jobTitle, email, phone, websiteUrl } = req.body;

    if (
      fullName !== undefined &&
      (typeof fullName !== "string" || !fullName.trim())
    ) {
      return res.status(400).json({
        message: "Full name must be a valid text value",
      });
    }

    if (email !== undefined && typeof email !== "string") {
      return res.status(400).json({
        message: "Email must be a valid text value",
      });
    }

    if (jobTitle !== undefined && typeof jobTitle !== "string") {
      return res.status(400).json({
        message: "Job title must be text",
      });
    }

    if (phone !== undefined && typeof phone !== "string") {
      return res.status(400).json({
        message: "Phone number must be text",
      });
    }

    if (websiteUrl !== undefined && typeof websiteUrl !== "string") {
      return res.status(400).json({
        message: "Website URL must be text",
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

    // Check ownership
    if (profile.userId !== req.user.id) {
      return res.status(403).json({
        message: "You cannot edit this profile",
      });
    }

    // Only allow these fields to be updated
    const allowedFields = [
      "fullName",
      "jobTitle",
      "email",
      "phone",
      "websiteUrl",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (Object.hasOwn(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    const updatedProfile = await prisma.profile.update({
      where: { publicId },
      data: updates,
      select: {
        publicId: true,
        fullName: true,
        jobTitle: true,
        email: true,
        phone: true,
        websiteUrl: true,
      },
    });

    return res.status(200).json({
      success: true,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to update profile",
    });
  }
}

export async function uploadMyPhoto(req, res) {
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
    if (profile.userId !== req.user.id) {
      return res.status(403).json({
        message: "You cannot upload a photo to this profile",
      });
    }

    const extensions = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };

    const extension = extensions[req.file.mimetype];
    const fileName = `profiles/${publicId}/${randomUUID()}.${extension}`;

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
      data: { photoUrl },
      select: {
        publicId: true,
        fullName: true,
        photoUrl: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Profile photo uploaded successfully",
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("Photo upload error:", error);

    return res.status(500).json({
      message: "Failed to upload profile photo",
    });
  }
}
