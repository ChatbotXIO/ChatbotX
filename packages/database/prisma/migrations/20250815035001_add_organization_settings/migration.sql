-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "domain" TEXT,
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "supportEmail" TEXT;

-- CreateIndex
CREATE INDEX "Organization_domain_idx" ON "Organization"("domain");
