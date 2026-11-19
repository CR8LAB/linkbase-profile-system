import { Router } from "express";

import {
  createSocialLink,
  getSocialLinks,
  updateSocialLink,
  deleteSocialLink,
  reorderSocialLinks,
} from "../controllers/socialLinkController.js";

import { authenticate } from "../middleware/authMiddleware.js";

const router = Router();

// CREATE - Admin or profile owner
router.post("/", authenticate, createSocialLink);

// READ - Public
router.get("/:profileId", getSocialLinks);

router.patch("/reorder", authenticate, reorderSocialLinks);

// UPDATE - Admin or profile owner
router.patch("/:id", authenticate, updateSocialLink);

// DELETE - Admin or profile owner
router.delete("/:id", authenticate, deleteSocialLink);

export default router;
