import prisma from "../config/prisma.js";

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
    const { fullName, email, phone, jobTitle, websiteUrl } = req.body;

    const updates = {};

    if (fullName !== undefined) updates.fullName = fullName;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (jobTitle !== undefined) updates.jobTitle = jobTitle;
    if (websiteUrl !== undefined) updates.websiteUrl = websiteUrl;

    const profile = await prisma.profile.update({
      where: { publicId },
      data: updates,
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

export async function getCompanyProfiles(req, res) {
  try {
    const { companyId } = req.params;

    const profiles = await prisma.profile.findMany({
      where: {
        companyId: companyId,
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

    const updatedProfile = await prisma.profile.update({
      where: { publicId },
      data: { userId },
      select: {
        id: true,
        publicId: true,
        fullName: true,
        userId: true,
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
