/*
  Warnings:

  - You are about to drop the column `group` on the `Folder` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "FolderType" AS ENUM ('Tag', 'Flow', 'CustomField', 'EmailCampaign', 'AutomatedResponse');

-- AlterTable
ALTER TABLE "Folder" DROP COLUMN "group",
ADD COLUMN     "folderType" "FolderType" NOT NULL DEFAULT 'Tag',
ADD COLUMN     "isTrash" BOOLEAN NOT NULL DEFAULT false;

-- DropEnum
DROP TYPE "FolderGroup";
