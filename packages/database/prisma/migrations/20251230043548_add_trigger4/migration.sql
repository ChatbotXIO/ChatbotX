-- AlterTable
ALTER TABLE "Trigger" ADD COLUMN     "folderId" TEXT,
ALTER COLUMN "filters" SET DEFAULT '{}',
ALTER COLUMN "actions" SET DEFAULT '{}';

-- CreateIndex
CREATE INDEX "Trigger_folderId_idx" ON "Trigger"("folderId");

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
