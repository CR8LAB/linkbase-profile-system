import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";
import {
  getAdminProfiles,
  getAdminSummary,
  getCustomers,
  deleteAdminProfile,
  deleteAdminCustomer,
} from "../controllers/adminController.js";

const router = Router();

router.use(authenticate, requireAdmin);
router.get("/summary", getAdminSummary);
router.get("/customers", getCustomers);
router.delete("/customers/:userId", deleteAdminCustomer);
router.get("/profiles", getAdminProfiles);
router.delete("/profiles/:publicId", deleteAdminProfile);

export default router;
