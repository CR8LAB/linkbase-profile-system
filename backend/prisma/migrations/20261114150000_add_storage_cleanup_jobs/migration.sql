CREATE TABLE "StorageCleanupJob" (
    "id" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "objectName" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageCleanupJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageCleanupJob_bucketName_objectName_key"
ON "StorageCleanupJob"("bucketName", "objectName");

CREATE INDEX "StorageCleanupJob_availableAt_lockedUntil_idx"
ON "StorageCleanupJob"("availableAt", "lockedUntil");
