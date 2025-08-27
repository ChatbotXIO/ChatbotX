/*
  Warnings:

  - Added the required column `phoneNumber` to the `IntegrationWhatsapp` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."IntegrationWhatsapp" ADD COLUMN     "phoneNumber" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
