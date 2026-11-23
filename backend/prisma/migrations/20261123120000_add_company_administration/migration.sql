ALTER TYPE "Role" ADD VALUE 'COMPANY_ADMIN';

ALTER TABLE "Company" ADD COLUMN "centralisedManagement" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "companyId" TEXT;
CREATE UNIQUE INDEX "User_companyId_key" ON "User"("companyId");
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_company_administrator_scope_check"
  CHECK (("role"::text = 'COMPANY_ADMIN') = ("companyId" IS NOT NULL));

CREATE TABLE "CompanyAdminInvitation" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "CompanyAdminInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompanyAdminInvitation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CompanyAdminInvitation_tokenHash_key" ON "CompanyAdminInvitation"("tokenHash");
CREATE INDEX "CompanyAdminInvitation_companyId_idx" ON "CompanyAdminInvitation"("companyId");
