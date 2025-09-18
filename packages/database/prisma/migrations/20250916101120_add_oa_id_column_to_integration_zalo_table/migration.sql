/*
  Warnings:

  - Added the required column `OA_ID` to the `IntegrationZalo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "public"."InboxType" ADD VALUE 'ZALO';

-- AlterEnum
ALTER TYPE "public"."IntegrationType" ADD VALUE 'ZALO';

-- AlterTable
ALTER TABLE "public"."IntegrationZalo" ADD COLUMN     "OA_ID" TEXT NOT NULL;
