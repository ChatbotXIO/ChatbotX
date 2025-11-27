/*
  Warnings:

  - The `inboxType` column on the `Broadcast` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterEnum
ALTER TYPE "AIEmbeddingStatus" ADD VALUE 'processing';

-- AlterTable
ALTER TABLE "Broadcast" ALTER COLUMN "inboxType" TYPE "InboxType" USING ("inboxType"::text::"InboxType");

