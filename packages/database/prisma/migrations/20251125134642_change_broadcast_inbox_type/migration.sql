/*
  Warnings:

  - The `inboxType` column on the `Broadcast` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Broadcast"
ADD COLUMN "inboxType_temp" TEXT NOT NULL DEFAULT 'omnichannel';

UPDATE "Broadcast"
SET "inboxType_temp" = COALESCE("inboxType"::text, 'omnichannel');

ALTER TABLE "Broadcast" DROP COLUMN "inboxType";
ALTER TABLE "Broadcast" RENAME COLUMN "inboxType_temp" TO "inboxType";

-- CreateIndex
CREATE INDEX "Broadcast_inboxType_idx" ON "Broadcast"("inboxType");
