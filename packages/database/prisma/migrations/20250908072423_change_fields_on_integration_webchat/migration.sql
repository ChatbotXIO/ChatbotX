/*
  Warnings:

  - You are about to drop the column `showHeader` on the `IntegrationWebchat` table. All the data in the column will be lost.
  - You are about to drop the column `showMessageInput` on the `IntegrationWebchat` table. All the data in the column will be lost.
  - You are about to drop the column `showPersonalLogo` on the `IntegrationWebchat` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."IntegrationWebchat" DROP COLUMN "showHeader",
DROP COLUMN "showMessageInput",
DROP COLUMN "showPersonalLogo",
ADD COLUMN     "hideHeader" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hideMessageInput" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showLogo" BOOLEAN NOT NULL DEFAULT false;
