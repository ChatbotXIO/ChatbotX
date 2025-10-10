/*
  Warnings:

  - Added the required column `spreadsheetId` to the `Spreadsheet` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Spreadsheet" ADD COLUMN     "spreadsheetId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Spreadsheet_chatbotId_idx" ON "public"."Spreadsheet"("chatbotId");

-- CreateIndex
CREATE INDEX "Spreadsheet_spreadsheetId_idx" ON "public"."Spreadsheet"("spreadsheetId");

-- CreateIndex
CREATE INDEX "Spreadsheet_chatbotId_spreadsheetId_idx" ON "public"."Spreadsheet"("chatbotId", "spreadsheetId");
