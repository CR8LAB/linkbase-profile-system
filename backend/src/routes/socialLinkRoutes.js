import { Router } from "express";

import {
  createSocialLink,
  getSocialLinks,
  updateSocialLink,
  deleteSocialLink,
} from "../controllers/socialLinkController.js";

const router = Router();

router.post("/", createSocialLink);
router.get("/:profileId", getSocialLinks);
router.patch("/:id", updateSocialLink);
router.delete("/:id", deleteSocialLink);
export default router;
