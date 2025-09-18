-- CreateIndex
CREATE INDEX "Spreadsheet_chatbotId_idx" ON "public"."Spreadsheet"("chatbotId");

-- CreateIndex
CREATE INDEX "Spreadsheet_spreadsheetId_idx" ON "public"."Spreadsheet"("spreadsheetId");

-- CreateIndex
CREATE INDEX "Spreadsheet_chatbotId_spreadsheetId_idx" ON "public"."Spreadsheet"("chatbotId", "spreadsheetId");
