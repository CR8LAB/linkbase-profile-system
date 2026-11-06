ALTER TABLE "Profile"
ADD COLUMN "shortCode" TEXT;

DO $$
DECLARE
    profile_row RECORD;
    candidate TEXT;
BEGIN
    FOR profile_row IN
        SELECT "id" FROM "Profile" WHERE "shortCode" IS NULL
    LOOP
        LOOP
            candidate := substr(
                md5(random()::text || clock_timestamp()::text || profile_row."id"),
                1,
                12
            );

            EXIT WHEN NOT EXISTS (
                SELECT 1 FROM "Profile" WHERE "shortCode" = candidate
            );
        END LOOP;

        UPDATE "Profile"
        SET "shortCode" = candidate
        WHERE "id" = profile_row."id";
    END LOOP;
END $$;

ALTER TABLE "Profile"
ALTER COLUMN "shortCode" SET NOT NULL;

CREATE UNIQUE INDEX "Profile_shortCode_key" ON "Profile"("shortCode");