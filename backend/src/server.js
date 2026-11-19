import "dotenv/config";
import app from "./app.js";
import { initializeJwtConfig } from "./config/jwt.js";
import prisma from "./config/prisma.js";
import { bucket } from "./config/storage.js";
import { processStorageCleanupJobs } from "./services/storageCleanup.js";

const PORT = process.env.PORT || 5000;

initializeJwtConfig();

app.listen(PORT, () => {
  console.log(`Linkbase API running on ${PORT}`);
  const runCleanup = () => processStorageCleanupJobs({ database: prisma, bucket })
    .catch((error) => {
      console.error("Scheduled GCS cleanup pass failed:", error.code || "CLEANUP_PROCESS_FAILED");
    });
  void runCleanup();
  const cleanupTimer = setInterval(runCleanup, 60_000);
  cleanupTimer.unref();
});
