/*
  Warnings:

  - You are about to drop the column `caption` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `file` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `Attachment` table. All the data in the column will be lost.
  - You are about to drop the column `thumbnail` on the `Attachment` table. All the data in the column will be lost.
  - Added the required column `conversationId` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originPath` to the `Attachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Attachment" DROP COLUMN "caption";

ALTER TABLE "Attachment" RENAME COLUMN "file" TO "originPath";

ALTER TABLE "Attachment" RENAME COLUMN "fileSize" TO "size";

ALTER TABLE "Attachment" RENAME COLUMN "thumbnail" TO "thumbnailPath";

ALTER TABLE "Attachment" ADD COLUMN "conversationId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
