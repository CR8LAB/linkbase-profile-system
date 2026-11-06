import { Router } from "express";
import { resolveShortCode } from "../controllers/shortUrlController.js";

const router = Router();

router.get("/:shortCode", resolveShortCode);

export default router;
