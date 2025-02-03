-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('Text', 'Image', 'Markdown', 'Audio', 'Video', 'File', 'Location', 'Carousel', 'Card', 'Dropdown', 'Choice');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('Image', 'Audio', 'Video', 'File');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('Bot', 'Contact', 'System', 'User');

-- AlterTable
ALTER TABLE "Folder" ALTER COLUMN "folderType" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Inbox" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInbox" (
    "contactId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "ContactInbox_pkey" PRIMARY KEY ("contactId","inboxId")
);

-- CreateTable
CREATE TABLE "WebWidgetTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "WebWidgetTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelWebWidget" (
    "id" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "authorizedDomains" TEXT[],
    "webWidgetTemplateId" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL DEFAULT '#007bff',
    "showHeader" BOOLEAN NOT NULL DEFAULT true,
    "showPersonalLogo" BOOLEAN NOT NULL DEFAULT false,
    "showMessageInput" BOOLEAN NOT NULL DEFAULT true,
    "customizeCss" TEXT,

    CONSTRAINT "ChannelWebWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "contactLastSeenAt" TIMESTAMP(3),
    "agentLastSeenAt" TIMESTAMP(3),
    "sourceId" TEXT,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "conversationId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "content" TEXT,
    "messageType" "MessageType" NOT NULL,
    "senderType" "SenderType" NOT NULL,
    "senderId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "attachmentType" "AttachmentType" NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inbox_chatbotId_idx" ON "Inbox"("chatbotId");

-- CreateIndex
CREATE INDEX "ChannelWebWidget_chatbotId_idx" ON "ChannelWebWidget"("chatbotId");

-- CreateIndex
CREATE INDEX "ChannelWebWidget_webWidgetTemplateId_idx" ON "ChannelWebWidget"("webWidgetTemplateId");

-- CreateIndex
CREATE INDEX "Conversation_chatbotId_idx" ON "Conversation"("chatbotId");

-- CreateIndex
CREATE INDEX "Conversation_contactId_idx" ON "Conversation"("contactId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_chatbotId_idx" ON "ConversationParticipant"("chatbotId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_idx" ON "ConversationParticipant"("conversationId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_contactId_idx" ON "ConversationParticipant"("contactId");

-- CreateIndex
CREATE INDEX "Message_chatbotId_idx" ON "Message"("chatbotId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_inboxId_idx" ON "Message"("inboxId");

-- CreateIndex
CREATE INDEX "Message_senderId_senderType_idx" ON "Message"("senderId", "senderType");

-- CreateIndex
CREATE INDEX "Attachment_chatbotId_idx" ON "Attachment"("chatbotId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "user_executorId" FOREIGN KEY ("executorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "contact_executorId" FOREIGN KEY ("executorId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inbox" ADD CONSTRAINT "Inbox_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelWebWidget" ADD CONSTRAINT "ChannelWebWidget_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelWebWidget" ADD CONSTRAINT "ChannelWebWidget_webWidgetTemplateId_fkey" FOREIGN KEY ("webWidgetTemplateId") REFERENCES "WebWidgetTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
