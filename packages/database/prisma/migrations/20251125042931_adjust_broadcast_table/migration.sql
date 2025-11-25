/*
  Warnings:

  - You are about to drop the column `conditions` on the `Broadcast` table. All the data in the column will be lost.
  - Added the required column `subaction` to the `Broadcast` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Broadcast" RENAME COLUMN "conditions" TO "contactFilter";

ALTER TABLE "Broadcast"
ADD COLUMN subaction_temp TEXT NOT NULL DEFAULT 'BSOO';

UPDATE "Broadcast"
SET subaction_temp = COALESCE(subaction::text, 'BSOO');

ALTER TABLE "Broadcast" DROP COLUMN subaction;
ALTER TABLE "Broadcast" RENAME COLUMN subaction_temp TO subaction;

-- DropEnum
DROP TYPE "BroadcastSubaction";
