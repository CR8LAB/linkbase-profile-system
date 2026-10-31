import { Router } from "express";

import { login, createUser } from "../controllers/authController.js";

import { authenticate, requireAdmin } from "../middleware/authMiddleware.js";

const router = Router();

// Public login
router.post("/login", login);

// Administrator-only customer creation
router.post("/users", authenticate, requireAdmin, createUser);

export default router;
