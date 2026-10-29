import { Router } from "express";

import {
  createCompany,
  getCompanies,
} from "../controllers/companyController.js";

import { getCompanyProfiles } from "../controllers/profileController.js";

const router = Router();

router.post("/", createCompany);
router.get("/", getCompanies);
router.get("/:companyId/profiles", getCompanyProfiles);

export default router;
