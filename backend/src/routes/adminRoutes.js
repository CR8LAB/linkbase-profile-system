import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";
import {
  getAdminProfiles,
  getAdminSummary,
  getCustomers,
} from "../controllers/adminController.js";

const router = Router();

router.use(authenticate, requireAdmin);
router.get("/summary", getAdminSummary);
router.get("/customers", getCustomers);
router.get("/profiles", getAdminProfiles);

export default router;
