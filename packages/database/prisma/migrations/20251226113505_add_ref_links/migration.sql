/*
  Warnings:

  - A unique constraint covering the columns `[name,flowId]` on the table `Reflink` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Reflink_chatbotId_flowId_key";

-- CreateIndex
CREATE UNIQUE INDEX "Reflink_name_flowId_key" ON "Reflink"("name", "flowId");
