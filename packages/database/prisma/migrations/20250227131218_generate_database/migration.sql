-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('Error', 'Audit');

-- CreateEnum
CREATE TYPE "ExecutorType" AS ENUM ('User', 'Contact');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('SHORTTEXT', 'NUMBER', 'DATE', 'DATETIME', 'BOOLEAN', 'LONGTEXT');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('ACCOUNT_FIELD', 'CUSTOM_FIELD');

-- CreateEnum
CREATE TYPE "FolderType" AS ENUM ('TAG', 'FLOW', 'CUSTOM_FIELD', 'EMAIL_CAMPAIGN', 'AUTOMATED_RESPONSE');

-- CreateEnum
CREATE TYPE "ChatbotPlan" AS ENUM ('FREE', 'PRO');

-- CreateEnum
CREATE TYPE "ChatbotMemberRole" AS ENUM ('OWNER', 'AGENT');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AssignedType" AS ENUM ('USER', 'TEAM');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('CHAT_WIDGET', 'GOOGLE_SHEETS', 'INSTAGRAM', 'MESSENGER', 'OPENAI', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "InboxType" AS ENUM ('CHAT_WIDGET', 'INSTAGRAM', 'MESSENGER', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('BOT', 'CONTACT', 'SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('INCOMING', 'OUTGOING', 'ACTIVITY');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('TEXT');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'FILE');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('Image', 'Audio', 'Video', 'File');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Chatbot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "defaultReply" TEXT,
    "targetCountry" TEXT,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
    "accountTimezone" TEXT NOT NULL,
    "brandColor" TEXT NOT NULL DEFAULT '#016DFF',
    "developmentMode" BOOLEAN NOT NULL DEFAULT false,
    "logo" TEXT,
    "plan" "ChatbotPlan" NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "Chatbot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotMember" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ChatbotMemberRole" NOT NULL,
    "isAdmin" BOOLEAN NOT NULL,
    "enableAnalytics" BOOLEAN NOT NULL,
    "enableFlows" BOOLEAN NOT NULL,
    "enableContacts" BOOLEAN NOT NULL,
    "enableOnlyAssignedContacts" BOOLEAN NOT NULL,
    "enableEmailAndPhone" BOOLEAN NOT NULL,
    "enableBroadcast" BOOLEAN NOT NULL,
    "enableEcommerce" BOOLEAN NOT NULL,

    CONSTRAINT "ChatbotMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxTeam" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "InboxTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxTeamMember" (
    "id" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "inboxTeamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatbotId" TEXT NOT NULL,
    "logType" "LogType" NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "url" TEXT,
    "executorType" "ExecutorType",
    "executorId" TEXT,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "avatar" TEXT,
    "chatbotId" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "gender" "Gender" NOT NULL,
    "source" TEXT NOT NULL,
    "assignedType" "AssignedType",
    "assignedId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "sourceId" TEXT,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "folderType" "FolderType" NOT NULL,
    "parentId" TEXT,
    "chatbotId" TEXT NOT NULL,
    "isTrash" BOOLEAN NOT NULL DEFAULT false,
    "paths" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "folderId" TEXT,
    "syncToMessenger" BOOLEAN NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
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
    "customizeStyles" TEXT,

    CONSTRAINT "ChannelWebWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "customFieldType" "CustomFieldType" NOT NULL,
    "description" TEXT,
    "folderId" TEXT,
    "fieldType" "FieldType" NOT NULL,
    "value" TEXT,
    "showInInbox" BOOLEAN NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inbox" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "inboxType" "InboxType" NOT NULL,

    CONSTRAINT "Inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "inboxType" "InboxType" NOT NULL,
    "liveChatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "followed" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "sourceId" TEXT,
    "conversationAttributes" JSONB,
    "contactLastSeenAt" TIMESTAMP(3),
    "agentLastSeenAt" TIMESTAMP(3),

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId","userId")
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
    "contentAttributes" JSONB,
    "messageType" "MessageType" NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "senderType" "SenderType" NOT NULL,
    "senderId" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "fileType" "FileType" NOT NULL,
    "messageId" TEXT NOT NULL,
    "sourceId" TEXT,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size" INTEGER NOT NULL DEFAULT 0,
    "thumbnailPath" TEXT,
    "originPath" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationType" "IntegrationType" NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAgent" (
    "id" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT,
    "messages" JSONB[],

    CONSTRAINT "AIAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAssistant" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "aiTriggerIds" TEXT[],
    "attachmentIds" TEXT[],
    "temperature" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AIAssistant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AITrigger" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "flowId" TEXT,
    "questions" JSONB[],
    "finalMessage" TEXT,

    CONSTRAINT "AITrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationOpenAI" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "auth" JSONB NOT NULL,
    "automatedResponse" BOOLEAN NOT NULL,
    "automatedVoiceResponse" BOOLEAN NOT NULL DEFAULT false,
    "voice" TEXT,
    "prompt" TEXT,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "aiAssistantId" TEXT,
    "aiAgentId" TEXT,

    CONSTRAINT "IntegrationOpenAI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationGoogleSheets" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "auth" JSONB NOT NULL,

    CONSTRAINT "IntegrationGoogleSheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWhatsapp" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "auth" JSONB NOT NULL,

    CONSTRAINT "IntegrationWhatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationChatWidget" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "inboxId" TEXT NOT NULL,
    "auth" JSONB NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "IntegrationChatWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spreadsheet" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "Spreadsheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "folderId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enableInInbox" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,
    "draftVersionId" TEXT,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowVersion" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "isDraft" BOOLEAN NOT NULL,

    CONSTRAINT "FlowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ContactToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContactToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AITriggerToIntegrationOpenAI" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AITriggerToIntegrationOpenAI_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_domain_key" ON "Workspace"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_chatbotId_sourceId_key" ON "Contact"("chatbotId", "sourceId");

-- CreateIndex
CREATE INDEX "Folder_chatbotId_idx" ON "Folder"("chatbotId");

-- CreateIndex
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

-- CreateIndex
CREATE INDEX "Tag_folderId_idx" ON "Tag"("folderId");

-- CreateIndex
CREATE INDEX "ChannelWebWidget_chatbotId_idx" ON "ChannelWebWidget"("chatbotId");

-- CreateIndex
CREATE INDEX "ChannelWebWidget_webWidgetTemplateId_idx" ON "ChannelWebWidget"("webWidgetTemplateId");

-- CreateIndex
CREATE INDEX "Inbox_chatbotId_idx" ON "Inbox"("chatbotId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_contactId_key" ON "Conversation"("contactId");

-- CreateIndex
CREATE INDEX "Conversation_chatbotId_sourceId_idx" ON "Conversation"("chatbotId", "sourceId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_chatbotId_idx" ON "ConversationParticipant"("chatbotId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_conversationId_idx" ON "ConversationParticipant"("conversationId");

-- CreateIndex
CREATE INDEX "Message_chatbotId_idx" ON "Message"("chatbotId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "Message_inboxId_idx" ON "Message"("inboxId");

-- CreateIndex
CREATE INDEX "Message_senderType_senderId_idx" ON "Message"("senderType", "senderId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_chatbotId_sourceId_key" ON "Message"("chatbotId", "sourceId");

-- CreateIndex
CREATE INDEX "Attachment_chatbotId_idx" ON "Attachment"("chatbotId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX "Integration_chatbotId_idx" ON "Integration"("chatbotId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationOpenAI_integrationId_key" ON "IntegrationOpenAI"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationGoogleSheets_integrationId_key" ON "IntegrationGoogleSheets"("integrationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWhatsapp_inboxId_key" ON "IntegrationWhatsapp"("inboxId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationChatWidget_inboxId_key" ON "IntegrationChatWidget"("inboxId");

-- CreateIndex
CREATE INDEX "_ContactToTag_B_index" ON "_ContactToTag"("B");

-- CreateIndex
CREATE INDEX "_AITriggerToIntegrationOpenAI_B_index" ON "_AITriggerToIntegrationOpenAI"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chatbot" ADD CONSTRAINT "Chatbot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotMember" ADD CONSTRAINT "ChatbotMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotMember" ADD CONSTRAINT "ChatbotMember_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxTeam" ADD CONSTRAINT "InboxTeam_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxTeamMember" ADD CONSTRAINT "InboxTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxTeamMember" ADD CONSTRAINT "InboxTeamMember_inboxTeamId_fkey" FOREIGN KEY ("inboxTeamId") REFERENCES "InboxTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxTeamMember" ADD CONSTRAINT "InboxTeamMember_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "user_executorId" FOREIGN KEY ("executorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "contact_executorId" FOREIGN KEY ("executorId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "user_assignedId" FOREIGN KEY ("assignedId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "team_assignedId" FOREIGN KEY ("assignedId") REFERENCES "InboxTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelWebWidget" ADD CONSTRAINT "ChannelWebWidget_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelWebWidget" ADD CONSTRAINT "ChannelWebWidget_webWidgetTemplateId_fkey" FOREIGN KEY ("webWidgetTemplateId") REFERENCES "WebWidgetTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inbox" ADD CONSTRAINT "Inbox_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAgent" ADD CONSTRAINT "AIAgent_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAssistant" ADD CONSTRAINT "AIAssistant_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITrigger" ADD CONSTRAINT "AITrigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_aiAssistantId_fkey" FOREIGN KEY ("aiAssistantId") REFERENCES "AIAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationGoogleSheets" ADD CONSTRAINT "IntegrationGoogleSheets_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationGoogleSheets" ADD CONSTRAINT "IntegrationGoogleSheets_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationChatWidget" ADD CONSTRAINT "IntegrationChatWidget_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationChatWidget" ADD CONSTRAINT "IntegrationChatWidget_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spreadsheet" ADD CONSTRAINT "Spreadsheet_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToTag" ADD CONSTRAINT "_ContactToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactToTag" ADD CONSTRAINT "_ContactToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AITriggerToIntegrationOpenAI" ADD CONSTRAINT "_AITriggerToIntegrationOpenAI_A_fkey" FOREIGN KEY ("A") REFERENCES "AITrigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AITriggerToIntegrationOpenAI" ADD CONSTRAINT "_AITriggerToIntegrationOpenAI_B_fkey" FOREIGN KEY ("B") REFERENCES "IntegrationOpenAI"("id") ON DELETE CASCADE ON UPDATE CASCADE;
