import prisma from "../config/prisma.js";
import { bucket } from "../config/storage.js";
import {
  canCustomizeProfile,
  customerProfileCustomizationFields,
  profileAccessSelect,
  profileManagementWhere,
  validateProfileCustomization,
} from "../services/profileValidation.js";
import { assignProfileAtomically } from "../services/profileConcurrency.js";
import { lockProfileScope } from "../services/profileAccess.js";
import { generateShortCode } from "../services/shortCode.js";
import { validateProfileBackgroundImage } from "../services/profileBackgroundImage.js";
import {
  createPdfDisplayNameUpdateHandler,
  createPdfDownloadHandler,
  DEFAULT_PDF_DISPLAY_NAME,
  getUploadPdfDisplayName,
  getPdfDownloadUrl,
  createPdfConflictError,
  uploadAndReplaceProfilePdf,
  validatePdfFile,
} from "../services/profilePdf.js";
import {
  activateStorageCleanupCandidate,
  clearProfilePdfAndQueueCleanup,
  createStorageCleanupCandidate,
  processStorageCleanupJobs,
  uploadAndReplaceProfileImage,
  persistProfileAssetReplacement,
} from "../services/storageCleanup.js";

function writeProfile(actor, publicId, write) {
  if (actor.role === "ADMIN") return write(prisma);
  return prisma.$transaction(async (tx) => {
    await lockProfileScope(tx, { publicId });
    return write(tx);
  });
}

export const updateProfilePdfDisplayName = createPdfDisplayNameUpdateHandler({
  findProfile: (publicId) =>
    prisma.profile.findUnique({
      where: { publicId },
      select: { ...profileAccessSelect, pdfUrl: true },
    }),
  updateProfile: (publicId, pdfDisplayName, actor) =>
    writeProfile(actor, publicId, (tx) => tx.profile.update({
      where: { publicId, ...profileManagementWhere(actor) },
      data: { pdfDisplayName },
      select: { publicId: true, pdfDisplayName: true },
    })),
  canCustomize: canCustomizeProfile,
});

export const redirectProfilePdf = createPdfDownloadHandler({
  findProfile: (publicId) =>
    prisma.profile.findUnique({
      where: { publicId },
      select: { id: true, pdfUrl: true, pdfDisplayName: true },
    }),
  bucket,
});

export async function authorizeProfileOwner(req, res, next) {
  try {
    const profile = await prisma.profile.findUnique({
      where: { publicId: req.params.publicId },
      select: profileAccessSelect,
    });

    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    if (!canCustomizeProfile(req.user, profile)) {
      return res.status(403).json({ message: "You cannot edit this profile" });
    }

    return next();
  } catch (error) {
    console.error("Profile upload authorization failed:", error);
    return res.status(500).json({ message: "Could not authorize profile upload" });
  }
}

export async function createProfile(req, res) {
  try {
    const body = req.body || {};
    const {
      publicId,
      fullName,
      companyId,
      jobTitle,
      email,
      phone,
      websiteUrl,
      fontFamily,
      buttonColor,
      bodyTextColor,
      backgroundColor,
      buttonTextColor,
      saveContactButtonColor,
      saveContactButtonTextColor,
    } = body;

    if (hasNonEmptyImageUrl(body.photoUrl)) {
      return res.status(400).json({
        message: "photoUrl cannot be provided. Upload the profile photo after creating the profile.",
      });
    }

    if (hasNonEmptyImageUrl(body.logoUrl)) {
      return res.status(400).json({
        message: "logoUrl cannot be provided. Upload the profile logo after creating the profile.",
      });
    }

    if (hasNonEmptyImageUrl(body.backgroundImageUrl)) {
      return res.status(400).json({
        message: "backgroundImageUrl cannot be provided. Upload a background image after creating the profile.",
      });
    }

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

    const validation = validateProfileCustomization(req.body || {});

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    let profile;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        profile = await prisma.profile.create({
          data: {
            publicId: publicId.trim(),
            shortCode: generateShortCode(),
            companyId: companyId.trim(),
            ...validation.updates,
          },
        });
        break;
      } catch (error) {
        const target = JSON.stringify(error.meta?.target || "").toLowerCase();
        if (error.code !== "P2002" || !target.includes("shortcode")) {
          throw error;
        }
      }
    }

    if (!profile)
      throw new Error("Could not generate a unique profile short code");

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

function hasNonEmptyImageUrl(value) {
  if (value === undefined || value === null) return false;
  return typeof value !== "string" || value.trim().length > 0;
}

export async function updateProfile(req, res) {
  try {
    const { publicId } = req.params;
    const body = req.body || {};
    if (Object.hasOwn(body, "backgroundImageUrl")) {
      return res.status(400).json({
        message: "backgroundImageUrl can only be changed through the background image upload endpoint",
      });
    }
    const existing = await prisma.profile.findUnique({
      where: { publicId },
      select: profileAccessSelect,
    });

    if (!existing) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (!canCustomizeProfile(req.user, existing)) {
      return res.status(403).json({ message: "You cannot edit this profile" });
    }

    const allowedFields = req.user.role === "CUSTOMER" ? customerProfileCustomizationFields : undefined;
    const validation = validateProfileCustomization(body, allowedFields);
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

    const profile = await writeProfile(req.user, publicId, (tx) => tx.profile.update({
      where: { publicId, ...profileManagementWhere(req.user) },
      data: updates,
      select: {
        publicId: true,
        shortCode: true,
        fullName: true,
        email: true,
        phone: true,
        jobTitle: true,
        websiteUrl: true,
        businessAddress: true,
        googleReviewUrl: true,
        whatsappNumber: true,
        photoUrl: true,
        logoUrl: true,
        backgroundImageUrl: true,
        fontFamily: true,
        buttonColor: true,
        bodyTextColor: true,
        backgroundColor: true,
        buttonTextColor: true,
        saveContactButtonColor: true,
        saveContactButtonTextColor: true,
        socialLinkBackgroundColor: true,
        socialLinkIconColor: true,
        pdfUrl: true,
        pdfDisplayName: true,
        companyId: true,
      },
    }));

    return res.status(200).json({
      success: true,
      profile: {
        ...profile,
        pdfUrl: profile.pdfUrl ? getPdfDownloadUrl(publicId) : null,
        pdfDisplayName: profile.pdfUrl
          ? profile.pdfDisplayName || DEFAULT_PDF_DISPLAY_NAME
          : null,
      },
    });
  } catch (error) {
    if (error.code === "P2025") return res.status(404).json({ message: "Profile not found" });
    console.error(error);

    return res.status(500).json({
      message: "Failed to update profile",
    });
  }
}

///////////////////////////////////////////////////

export function getProfile(req, res) {
  return readProfile(req, res, false);
}

export function getManagedProfile(req, res) {
  return readProfile(req, res, true);
}

async function readProfile(req, res, managed) {
  try {
    const { publicId } = req.params;

    const profile = await prisma.profile.findUnique({
      where: { publicId, ...(managed ? profileManagementWhere(req.user) : {}) },
      select: {
        ...(managed && { id: true }),
        publicId: true,
        shortCode: true,
        fullName: true,
        jobTitle: true,
        email: true,
        phone: true,
        websiteUrl: true,
        businessAddress: true,
        googleReviewUrl: true,
        whatsappNumber: true,
        photoUrl: true,
        logoUrl: true,
        backgroundImageUrl: true,
        fontFamily: true,
        buttonColor: true,
        bodyTextColor: true,
        backgroundColor: true,
        buttonTextColor: true,
        saveContactButtonColor: true,
        saveContactButtonTextColor: true,
        socialLinkBackgroundColor: true,
        socialLinkIconColor: true,
        pdfUrl: true,
        pdfDisplayName: true,
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
      profile: {
        ...profile,
        pdfUrl: profile.pdfUrl ? getPdfDownloadUrl(publicId) : null,
        pdfDisplayName: profile.pdfUrl
          ? profile.pdfDisplayName || DEFAULT_PDF_DISPLAY_NAME
          : null,
      },
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
  if (req.user.role === "COMPANY_ADMIN") {
    return res.status(403).json({ message: "Use the company profile dashboard" });
  }
  try {
    const profile = await prisma.profile.findFirst({
      where: {
        userId: req.user.id,
        ...profileManagementWhere(req.user),
      },
      select: {
        id: true,
        publicId: true,
        shortCode: true,
        fullName: true,
        jobTitle: true,
        email: true,
        phone: true,
        websiteUrl: true,
        businessAddress: true,
        googleReviewUrl: true,
        whatsappNumber: true,
        photoUrl: true,
        logoUrl: true,
        backgroundImageUrl: true,
        fontFamily: true,
        buttonColor: true,
        bodyTextColor: true,
        backgroundColor: true,
        buttonTextColor: true,
        saveContactButtonColor: true,
        saveContactButtonTextColor: true,
        socialLinkBackgroundColor: true,
        socialLinkIconColor: true,
        pdfUrl: true,
        pdfDisplayName: true,
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
      profile: {
        ...profile,
        pdfUrl: profile.pdfUrl ? getPdfDownloadUrl(profile.publicId) : null,
        pdfDisplayName: profile.pdfUrl
          ? profile.pdfDisplayName || DEFAULT_PDF_DISPLAY_NAME
          : null,
      },
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

        company: {
          select: {
            name: true,
            centralisedManagement: true,
            administrator: { select: { email: true } },
          },
        },
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
      profiles: profiles.map(({ company, ...profile }) => ({
        ...profile,
        company: company?.centralisedManagement ? company : null,
      })),
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to retrieve company profiles",
    });
  }
}

export async function listManagedProfiles(req, res) {
  try {
    const profiles = await prisma.profile.findMany({
      where: profileManagementWhere(req.user),
      select: { publicId: true, fullName: true, jobTitle: true },
      orderBy: { fullName: "asc" },
    });
    return res.json({ success: true, profiles });
  } catch (error) {
    console.error("Managed profile list failed:", error);
    return res.status(500).json({ message: "Failed to retrieve profiles" });
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

    const result = await prisma.$transaction((tx) =>
      assignProfileAtomically(tx, publicId, userId),
    );

    if (result.status === "invalid-customer") {
      return res.status(400).json({ message: "Valid customer account required" });
    }
    if (result.status === "not-found") {
      return res.status(404).json({ message: "Profile not found" });
    }
    if (result.status === "profile-conflict") {
      return res.status(409).json({
        message: "Profile is already assigned to another customer",
      });
    }
    if (result.status === "customer-conflict") {
      return res.status(409).json({
        message: "Customer is already assigned to another profile",
      });
    }

    return res.status(200).json(result.profile);
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

    const profile = await prisma.profile.findUnique({
      where: { publicId },
      select: {
        id: true,
        publicId: true,
        fullName: true,
        ...profileAccessSelect,
        photoUrl: true,
        logoUrl: true,
        backgroundImageUrl: true,
      },
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

    const updatedProfile = await uploadAndReplaceProfileImage({
      database: prisma,
      bucket,
      profile,
      publicId,
      imageField,
      accessWhere: profileManagementWhere(req.user),
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
    });

    return res.status(200).json({
      success: true,
      message: "Profile image uploaded successfully",
      profile: updatedProfile,
    });
  } catch (error) {
    if (error.code === "PROFILE_MEDIA_CONFLICT") {
      return res.status(409).json({ message: "The profile image changed during this request. Please retry." });
    }
    console.error("Profile image upload failed:", error.code || "IMAGE_UPLOAD_FAILED");

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

export async function uploadProfileBackgroundImage(req, res) {
  const validationError = validateProfileBackgroundImage(req.file);
  if (validationError) return res.status(400).json({ message: validationError });
  return uploadProfileImage(req, res, "backgroundImageUrl");
}

export async function uploadProfilePdf(req, res) {
  const validationError = validatePdfFile(req.file);
  if (validationError) return res.status(400).json({ message: validationError });

  const { publicId } = req.params;
  try {
    const profile = await prisma.profile.findUnique({ where: { publicId }, include: { company: true } });
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    if (!canCustomizeProfile(req.user, profile)) {
      return res.status(403).json({ message: "You cannot edit this profile" });
    }

    const updated = await uploadAndReplaceProfilePdf({
      bucket,
      profileId: profile.id,
      publicId,
      buffer: req.file.buffer,
      pdfDisplayName: getUploadPdfDisplayName(req.file.originalname),
      createCleanupCandidate: (bucketName, objectName) =>
        createStorageCleanupCandidate(prisma, bucketName, objectName),
      activateCleanupCandidate: (bucketName, objectName) =>
        activateStorageCleanupCandidate(prisma, bucketName, objectName),
      processCleanup: () => processStorageCleanupJobs({ database: prisma, bucket }),
      persist: async (pdfUrl, pdfDisplayName, newObjectName) =>
        persistProfileAssetReplacement({
          database: prisma,
          bucketName: bucket.name,
          publicId,
          profileId: profile.id,
          expectedUserId: profile.userId,
          accessWhere: profileManagementWhere(req.user),
          imageField: "pdfUrl",
          expectedUrl: profile.pdfUrl,
          newUrl: pdfUrl,
          newObjectName,
          pdfDisplayName,
        }),
    });

    return res.status(200).json({
      success: true,
      message: "PDF uploaded successfully",
      profile: updated,
    });
  } catch (error) {
    console.error("Profile PDF upload error:", error);
    if (error.code === "PROFILE_PDF_CONFLICT") {
      return res.status(409).json({ message: "The PDF changed during this request. Please retry." });
    }
    return res.status(500).json({ message: "Failed to upload PDF" });
  }
}

export async function removeProfilePdf(req, res) {
  const { publicId } = req.params;
  try {
    const profile = await prisma.profile.findUnique({ where: { publicId }, include: { company: true } });
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    if (!canCustomizeProfile(req.user, profile)) {
      return res.status(403).json({ message: "You cannot edit this profile" });
    }
    if (!profile.pdfUrl) {
      return res.status(200).json({
        success: true,
        profile: { publicId, pdfUrl: null, pdfDisplayName: null },
      });
    }

    const cleared = await clearProfilePdfAndQueueCleanup({
      database: prisma,
      bucketName: bucket.name,
      publicId,
      profileId: profile.id,
      expectedUserId: profile.userId,
      accessWhere: profileManagementWhere(req.user),
      expectedUrl: profile.pdfUrl,
    });
    if (!cleared) throw createPdfConflictError();
    await processStorageCleanupJobs({ database: prisma, bucket }).catch((error) => {
      console.error("Queued PDF cleanup could not run:", error.code || "CLEANUP_PROCESS_FAILED");
    });
    return res.status(200).json({
      success: true,
      profile: { publicId, pdfUrl: null, pdfDisplayName: null },
    });
  } catch (error) {
    console.error("Profile PDF removal error:", error);
    if (error.code === "PROFILE_PDF_CONFLICT") {
      return res.status(409).json({ message: "The PDF changed during this request. Please retry." });
    }
    return res.status(500).json({ message: "Failed to remove PDF" });
  }
}
