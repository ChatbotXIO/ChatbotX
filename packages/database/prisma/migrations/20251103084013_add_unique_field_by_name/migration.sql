/*
  Warnings:

  - A unique constraint covering the columns `[chatbotId,fieldType,name]` on the table `Field` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Field_chatbotId_fieldType_name_key" ON "Field"("chatbotId", "fieldType", "name");
