/*
  Warnings:

  - Added the required column `availableTools` to the `AIMCPServer` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."AIMCPServer" ADD COLUMN     "availableTools" JSONB NOT NULL,
ADD COLUMN     "selectedTools" TEXT[];
