/*
  Warnings:

  - You are about to drop the column `isPublished` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Flow` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `FlowVersion` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[flowId,isDraft]` on the table `FlowVersion` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name` to the `Flow` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Flow" DROP CONSTRAINT "Flow_currentVersionId_fkey";

-- DropForeignKey
ALTER TABLE "Flow" DROP CONSTRAINT "Flow_folderId_fkey";

-- DropForeignKey
ALTER TABLE "Flow" DROP CONSTRAINT "Flow_userId_fkey";

-- DropIndex
DROP INDEX "Flow_currentVersionId_key";

ALTER TABLE "Flow"
RENAME COLUMN "title" TO "name";

-- AlterTable
ALTER TABLE "Flow" DROP COLUMN "isPublished",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "draftVersionId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "FlowVersion" DROP COLUMN "version",
ALTER COLUMN "isDraft" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
