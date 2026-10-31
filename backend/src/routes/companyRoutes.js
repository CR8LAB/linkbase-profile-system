import { Router } from "express";

import {
  createCompany,
  getCompanies,
} from "../controllers/companyController.js";

import { getCompanyProfiles } from "../controllers/profileController.js";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", authenticate, requireAdmin, createCompany);
router.get("/", getCompanies);
router.get("/:companyId/profiles", getCompanyProfiles);

export default router;
