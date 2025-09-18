/*
  Warnings:

  - You are about to drop the column `OA_ID` on the `IntegrationZalo` table. All the data in the column will be lost.
  - Added the required column `oaId` to the `IntegrationZalo` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."IntegrationZalo" DROP COLUMN "OA_ID",
ADD COLUMN     "oaId" TEXT NOT NULL;
