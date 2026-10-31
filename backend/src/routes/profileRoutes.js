import { Router } from "express";

import {
  createProfile,
  updateProfile,
  getProfile,
  assignProfile,
  updateMyProfile,
} from "../controllers/profileController.js";

import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// ADMIN ONLY
router.post("/", authenticate, requireAdmin, createProfile);

router.patch("/:publicId/assign", authenticate, requireAdmin, assignProfile);

router.patch("/:publicId", authenticate, requireAdmin, updateProfile);

// PUBLIC
router.get("/:publicId", getProfile);

//UPDATES
router.patch("/:publicId/my-details", authenticate, updateMyProfile);

export default router;
