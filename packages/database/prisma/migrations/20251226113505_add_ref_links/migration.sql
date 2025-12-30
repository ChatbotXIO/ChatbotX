/*
  Warnings:

  - A unique constraint covering the columns `[name,flowId]` on the table `RefLink` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "RefLink_chatbotId_flowId_key";

-- CreateIndex
CREATE UNIQUE INDEX "RefLink_name_flowId_key" ON "RefLink"("name", "flowId");
