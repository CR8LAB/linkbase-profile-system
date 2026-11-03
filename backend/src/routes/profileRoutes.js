import { Router } from "express";

import {
  createProfile,
  updateProfile,
  getProfile,
  assignProfile,
  updateMyProfile,
  getMyProfile,
  uploadMyPhoto,
} from "../controllers/profileController.js";

import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

import upload from "../middleware/uploadMiddleware.js";

const router = Router();

// ADMIN ONLY
// ADMIN ONLY
router.post("/", authenticate, requireAdmin, createProfile);

router.patch("/:publicId/assign", authenticate, requireAdmin, assignProfile);

router.patch("/:publicId", authenticate, requireAdmin, updateProfile);

// CUSTOMER - MUST BE BEFORE PUBLIC PROFILE ROUTE
router.get("/my-profile", authenticate, getMyProfile);

// PUBLIC
router.get("/:publicId", getProfile);

// CUSTOMER UPDATES
router.patch("/:publicId/my-details", authenticate, updateMyProfile);

router.post(
  "/:publicId/photo",
  authenticate,
  upload.single("photo"),
  uploadMyPhoto,
);

export default router;
