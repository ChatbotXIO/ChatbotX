/*
  Warnings:

  - A unique constraint covering the columns `[chatbotId,name]` on the table `Tag` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Tag_chatbotId_name_key" ON "Tag"("chatbotId", "name");

ALTER TABLE "Tag" ALTER COLUMN "syncToMessenger" SET DEFAULT false;