/*
  Warnings:

  - A unique constraint covering the columns `[sourceId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Message_sourceId_key" ON "Message"("sourceId");
