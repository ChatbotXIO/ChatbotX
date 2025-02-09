-- AddForeignKey
ALTER TABLE "Inbox" ADD CONSTRAINT "Inbox_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
