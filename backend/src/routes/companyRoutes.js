import { Router } from "express";

import {
  createCompany,
  getCompanies,
  updateCompany,
  deleteCompany,
  listCompanyAdministration,
  updateCentralisedManagement,
} from "../controllers/companyController.js";

import { getCompanyProfiles } from "../controllers/profileController.js";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", authenticate, requireAdmin, createCompany);
router.patch("/:companyId", authenticate, requireAdmin, updateCompany);
router.delete("/:companyId", authenticate, requireAdmin, deleteCompany);
router.get("/", getCompanies);
router.get("/administration", authenticate, requireAdmin, listCompanyAdministration);
router.patch("/:companyId/centralised-management", authenticate, requireAdmin, updateCentralisedManagement);
router.get(
  "/:companyId/profiles",
  authenticate,
  requireAdmin,
  getCompanyProfiles,
);

export default router;
