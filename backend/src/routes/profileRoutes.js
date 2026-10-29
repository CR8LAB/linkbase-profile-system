import { Router } from "express";
import {
  createProfile,
  updateProfile,
  getProfile,
} from "../controllers/profileController.js";

// 1. Create the router
const router = Router();

// 2. Register the routes
router.post("/", createProfile);
router.patch("/:publicId", updateProfile);
router.get("/:publicId", getProfile);

// 3. Export the router
export default router;
