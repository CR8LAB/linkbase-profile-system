import express from "express";
import companyRoutes from "./routes/companyRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import socialLinkRoutes from "./routes/socialLinkRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import shortUrlRoutes from "./routes/shortUrlRoutes.js";
import { redirectShortCode } from "./controllers/shortUrlController.js";
import cors from "cors";
import { getTrustProxySetting } from "./config/trustProxy.js";

// 1. Create the Express application
const app = express();
// Render connects through one reverse proxy. Do not trust forwarded headers
// from direct local development requests.
app.set("trust proxy", getTrustProxySetting());
const allowedOrigins = (
  process.env.FRONTEND_ORIGINS || "http://localhost:5173,http://127.0.0.1:4173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// 2. Add JSON middleware
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());
app.use("/api/companies", companyRoutes);
app.use("/api/profiles", profileRoutes);
app.use("/api/social-links", socialLinkRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/short-links", shortUrlRoutes);

// 3. Export the application
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LinkBase API is Running",
  });
});

app.get("/:shortCode", redirectShortCode);

export default app;
