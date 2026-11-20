import { Router } from "express";

import {
  createProfile,
  updateProfile,
  getProfile,
  assignProfile,
  updateMyProfile,
  getMyProfile,
  uploadMyPhoto,
  uploadProfileLogo,
  uploadProfileBackgroundImage,
  uploadProfilePdf,
  removeProfilePdf,
  redirectProfilePdf,
  updateProfilePdfDisplayName,
  authorizeProfileOwner,
} from "../controllers/profileController.js";

import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

import upload, { uploadBackgroundImage } from "../middleware/uploadMiddleware.js";
import uploadPdf from "../middleware/pdfUploadMiddleware.js";
import {
  getProfileVisitStatistics,
  recordPublicProfileVisit,
} from "../controllers/profileVisitController.js";

const router = Router();

// ADMIN ONLY
// ADMIN ONLY
router.post("/", authenticate, requireAdmin, createProfile);

router.patch("/:publicId/assign", authenticate, requireAdmin, assignProfile);

router.patch("/:publicId", authenticate, updateProfile);

// CUSTOMER - MUST BE BEFORE PUBLIC PROFILE ROUTE
router.get("/my-profile", authenticate, getMyProfile);

router.post("/:publicId/visits", recordPublicProfileVisit);
router.get("/:publicId/statistics", authenticate, getProfileVisitStatistics);

// Public download redirects to a short-lived signed URL.
router.get("/:publicId/pdf/download", redirectProfilePdf);

// PUBLIC
router.get("/:publicId", getProfile);

// CUSTOMER UPDATES
router.patch("/:publicId/my-details", authenticate, updateMyProfile);

router.post(
  "/:publicId/photo",
  authenticate,
  authorizeProfileOwner,
  upload.single("photo"),
  uploadMyPhoto,
);

router.post(
  "/:publicId/pdf",
  authenticate,
  authorizeProfileOwner,
  uploadPdf,
  uploadProfilePdf,
);

router.patch(
  "/:publicId/pdf/display-name",
  authenticate,
  updateProfilePdfDisplayName,
);

router.delete("/:publicId/pdf", authenticate, removeProfilePdf);

router.post(
  "/:publicId/logo",
  authenticate,
  authorizeProfileOwner,
  upload.single("logo"),
  uploadProfileLogo,
);

router.post(
  "/:publicId/background-image",
  authenticate,
  requireAdmin,
  authorizeProfileOwner,
  uploadBackgroundImage,
  uploadProfileBackgroundImage,
);

export default router;
