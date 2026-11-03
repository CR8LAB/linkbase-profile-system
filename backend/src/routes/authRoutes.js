import { Router } from "express";

import {
  claimProfile,
  completePasswordReset,
  createUser,
  inviteProfileClaim,
  login,
  requestPasswordReset,
} from "../controllers/authController.js";

import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";
import {
  claimRateLimit,
  invitationRateLimit,
  loginRateLimit,
  resetCompleteRateLimit,
  resetRequestRateLimit,
} from "../middleware/authRateLimit.js";

const router = Router();

// Public login
router.post("/login", loginRateLimit, login);

router.post(
  "/profiles/:publicId/claim-invitations",
  invitationRateLimit,
  authenticate,
  requireAdmin,
  inviteProfileClaim,
);
router.post("/claim", claimRateLimit, claimProfile);
router.post(
  "/password-reset/request",
  resetRequestRateLimit,
  requestPasswordReset,
);
router.post(
  "/password-reset/complete",
  resetCompleteRateLimit,
  completePasswordReset,
);

// Administrator-only customer creation
router.post("/users", authenticate, requireAdmin, createUser);

export default router;
