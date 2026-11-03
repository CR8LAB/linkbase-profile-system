import express from "express";
import companyRoutes from "./routes/companyRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import socialLinkRoutes from "./routes/socialLinkRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import cors from "cors";

// 1. Create the Express application
const app = express();
const allowedOrigins = (process.env.FRONTEND_ORIGINS || "http://localhost:5173")
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

// 3. Export the application
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "LinkBase API is Running",
  });
});

export default app;
