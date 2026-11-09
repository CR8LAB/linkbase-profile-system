CREATE TABLE "ProfileVisit" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileVisit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfileVisit_profileId_createdAt_idx"
ON "ProfileVisit"("profileId", "createdAt");

ALTER TABLE "ProfileVisit"
ADD CONSTRAINT "ProfileVisit_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "Profile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
