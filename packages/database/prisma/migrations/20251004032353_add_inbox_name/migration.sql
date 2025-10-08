/*
  Warnings:

  - You are about to drop the column `phoneNumber` on the `IntegrationWhatsapp` table. All the data in the column will be lost.
  - Added the required column `name` to the `IntegrationMessenger` table without a default value. This is not possible if the table is not empty.
  - Added the required column `businessId` to the `IntegrationWhatsapp` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `IntegrationWhatsapp` table without a default value. This is not possible if the table is not empty.
  - Added the required column `wabaId` to the `IntegrationWhatsapp` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `IntegrationZalo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."IntegrationMessenger" ADD COLUMN     "name" TEXT;
UPDATE "public"."IntegrationMessenger" SET "name" = "IntegrationMessenger"."pageId";
ALTER TABLE "public"."IntegrationMessenger" ALTER COLUMN "name" SET NOT NULL;


-- AlterTable
ALTER TABLE "public"."IntegrationWhatsapp" DROP COLUMN "phoneNumber",
ADD COLUMN     "businessId" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "wabaId" TEXT;
UPDATE "public"."IntegrationWhatsapp" SET "name" = "IntegrationWhatsapp"."phoneNumberId";
UPDATE "public"."IntegrationWhatsapp" SET "wabaId" = "IntegrationWhatsapp"."phoneNumberId";
UPDATE "public"."IntegrationWhatsapp" SET "businessId" = "IntegrationWhatsapp"."phoneNumberId";
ALTER TABLE "public"."IntegrationWhatsapp" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "public"."IntegrationWhatsapp" ALTER COLUMN "wabaId" SET NOT NULL;
ALTER TABLE "public"."IntegrationWhatsapp" ALTER COLUMN "businessId" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."IntegrationZalo" ADD COLUMN     "name" TEXT;
UPDATE "public"."IntegrationZalo" SET "name" = "IntegrationZalo"."oaId";
ALTER TABLE "public"."IntegrationZalo" ALTER COLUMN "name" SET NOT NULL;
