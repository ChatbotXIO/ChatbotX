/*
  Warnings:

  - Added the required column `phoneNumberId` to the `IntegrationWhatsapp` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."IntegrationWhatsapp" ADD COLUMN     "phoneNumberId" TEXT NOT NULL;
