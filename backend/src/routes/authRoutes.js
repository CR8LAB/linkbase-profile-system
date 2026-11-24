import { Router } from "express";

import {
  claimProfile,
  completePasswordReset,
  createUser,
  inviteProfileClaim,
  login,
  logout,
  renewSession,
  requestPasswordReset,
} from "../controllers/authController.js";

import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";
import { claimCompanyAdmin, inviteCompanyAdmin } from "../controllers/companyAdminInvitationController.js";
import {
  claimRateLimit,
  invitationRateLimit,
  loginAccountRateLimit,
  loginRateLimit,
  resetRequestAccountRateLimit,
  resetCompleteRateLimit,
  resetRequestRateLimit,
} from "../middleware/authRateLimit.js";

const router = Router();

// Public login
router.post("/login", loginRateLimit, loginAccountRateLimit, login);
router.post("/logout", authenticate, logout);
router.post("/session/renew", authenticate, renewSession);

router.post(
  "/profiles/:publicId/claim-invitations",
  invitationRateLimit,
  authenticate,
  requireAdmin,
  inviteProfileClaim,
);
router.post("/claim", claimRateLimit, claimProfile);
router.post("/companies/:companyId/admin-invitations", authenticate, requireAdmin, invitationRateLimit, inviteCompanyAdmin);
router.post("/claim-company-admin", claimRateLimit, claimCompanyAdmin);
router.post(
  "/password-reset/request",
  resetRequestRateLimit,
  resetRequestAccountRateLimit,
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
