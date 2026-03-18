CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "AIEmbeddingStatus" AS ENUM('pending', 'success', 'error', 'processing');--> statement-breakpoint
CREATE TYPE "BroadcastSchedulesType" AS ENUM('now', 'future');--> statement-breakpoint
CREATE TYPE "BroadcastStatus" AS ENUM('scheduled', 'sent');--> statement-breakpoint
CREATE TYPE "ChatbotMemberRole" AS ENUM('owner', 'agent');--> statement-breakpoint
CREATE TYPE "ContentType" AS ENUM('text', 'location');--> statement-breakpoint
CREATE TYPE "CustomFieldType" AS ENUM('shortText', 'number', 'date', 'datetime', 'boolean', 'longText');--> statement-breakpoint
CREATE TYPE "FieldType" AS ENUM('accountField', 'customField');--> statement-breakpoint
CREATE TYPE "FileType" AS ENUM('image', 'video', 'audio', 'gif', 'file');--> statement-breakpoint
CREATE TYPE "FolderType" AS ENUM('tag', 'flow', 'customField', 'automatedResponse');--> statement-breakpoint
CREATE TYPE "Gender" AS ENUM('male', 'female', 'unknown');--> statement-breakpoint
CREATE TYPE "InboxType" AS ENUM('webchat', 'messenger', 'whatsapp', 'zalo');--> statement-breakpoint
CREATE TYPE "IntegrationType" AS ENUM('webchat', 'googleSheets', 'messenger', 'openai', 'gemini', 'whatsapp', 'zalo');--> statement-breakpoint
CREATE TYPE "LogType" AS ENUM('error', 'audit');--> statement-breakpoint
CREATE TYPE "MessageType" AS ENUM('incoming', 'outgoing', 'activity');--> statement-breakpoint
CREATE TYPE "SenderType" AS ENUM('bot', 'contact', 'system', 'user');--> statement-breakpoint
CREATE TABLE "Account" (
	"id" text PRIMARY KEY,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"accessTokenExpiresAt" timestamp(3),
	"refreshToken" text,
	"refreshTokenExpiresAt" timestamp(3),
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ActivityLog" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"userId" text NOT NULL,
	"data" text NOT NULL,
	"action" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIAgent" (
	"id" text PRIMARY KEY,
	"chatbotId" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"prompt" text,
	"messages" jsonb[] NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"tools" text[] NOT NULL,
	"models" jsonb[] NOT NULL,
	"temperature" double precision NOT NULL,
	"maxOutputTokens" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIAssistant" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"aiTriggerIds" text[] NOT NULL,
	"attachmentIds" text[] NOT NULL,
	"temperature" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIEmbedding" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"status" "AIEmbeddingStatus" DEFAULT 'pending'::"AIEmbeddingStatus" NOT NULL,
	"chatbotId" text NOT NULL,
	"aiFileId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIFile" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"size" integer NOT NULL,
	"mimeType" text NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIFunction" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"dataCollect" jsonb,
	"outputMessage" text,
	"triggerFlowId" text,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIMCPServer" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"auth" jsonb NOT NULL,
	"availableTools" jsonb NOT NULL,
	"selectedTools" text[] NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AITrigger" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"flowId" text,
	"questions" jsonb[] NOT NULL,
	"finalMessage" text
);
--> statement-breakpoint
CREATE TABLE "_AITriggerToIntegrationOpenAI" (
	"A" text,
	"B" text,
	CONSTRAINT "_AITriggerToIntegrationOpenAI_AB_pkey" PRIMARY KEY("A","B")
);
--> statement-breakpoint
CREATE TABLE "Attachment" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"conversationId" text NOT NULL,
	"fileType" "FileType" NOT NULL,
	"messageId" text NOT NULL,
	"sourceId" text,
	"mimeType" text NOT NULL,
	"width" integer,
	"height" integer,
	"size" integer DEFAULT 0 NOT NULL,
	"thumbnailPath" text,
	"originPath" text NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "AutomatedResponse" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"userMessages" text[] NOT NULL,
	"folderId" text,
	"replies" jsonb[] NOT NULL,
	"status" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Broadcast" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"chatbotId" text NOT NULL,
	"flowId" text NOT NULL,
	"status" "BroadcastStatus" NOT NULL,
	"schedulesType" "BroadcastSchedulesType" NOT NULL,
	"schedulesAt" timestamp(3) NOT NULL,
	"contactFilter" jsonb,
	"subaction" text DEFAULT 'BSOO' NOT NULL,
	"inboxType" text DEFAULT 'omnichannel' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChatbotMember" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"userId" text NOT NULL,
	"role" "ChatbotMemberRole" NOT NULL,
	"notificationChannels" jsonb DEFAULT '{}' NOT NULL,
	"notificationTypes" jsonb DEFAULT '{}' NOT NULL,
	"permissions" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Chatbot" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"defaultReply" text,
	"targetCountry" text,
	"defaultLanguage" text DEFAULT 'en' NOT NULL,
	"accountTimezone" text NOT NULL,
	"brandColor" text DEFAULT '#016DFF' NOT NULL,
	"developmentMode" boolean DEFAULT false NOT NULL,
	"logo" text,
	"organizationId" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChatbotUsage" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"contactsCount" integer DEFAULT 0 NOT NULL,
	"maxContacts" integer DEFAULT 0 NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContactCustomField" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"value" text NOT NULL,
	"contactId" text NOT NULL,
	"customFieldId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContactInbox" (
	"contactId" text,
	"inboxId" text,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"sourceId" text NOT NULL,
	CONSTRAINT "ContactInbox_pkey" PRIMARY KEY("contactId","inboxId")
);
--> statement-breakpoint
CREATE TABLE "Contact" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"avatar" text,
	"phoneNumber" text,
	"email" text,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"emailOptIn" boolean DEFAULT false NOT NULL,
	"firstName" text,
	"lastName" text,
	"gender" "Gender" NOT NULL,
	"source" text NOT NULL,
	"lastSeenAt" timestamp(3),
	"sourceId" text,
	"blockedAt" timestamp(3),
	"enableBroadcast" boolean DEFAULT false NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContactNote" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"content" text NOT NULL,
	"contactId" text NOT NULL,
	"createdById" text
);
--> statement-breakpoint
CREATE TABLE "ContactsOnBroadcasts" (
	"broadcastId" text,
	"contactId" text,
	"sent" boolean DEFAULT false NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"seen" boolean DEFAULT false NOT NULL,
	"clicked" boolean DEFAULT false NOT NULL,
	"failed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ContactsOnBroadcasts_pkey" PRIMARY KEY("broadcastId","contactId")
);
--> statement-breakpoint
CREATE TABLE "_ContactToTag" (
	"contactId" text,
	"tagId" text,
	CONSTRAINT "_ContactToTag_contactId_tagId_pkey" PRIMARY KEY("contactId","tagId")
);
--> statement-breakpoint
CREATE TABLE "Conversation" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"liveChatEnabled" boolean DEFAULT false NOT NULL,
	"archivedAt" timestamp(3),
	"inboxType" "InboxType" DEFAULT 'webchat'::"InboxType" NOT NULL,
	"sourceId" text,
	"conversationAttributes" jsonb,
	"contactLastSeenAt" timestamp(3),
	"agentLastSeenAt" timestamp(3),
	"lastActivityAt" timestamp(3) DEFAULT now() NOT NULL,
	"followed" boolean DEFAULT false NOT NULL,
	"assignedUserId" text,
	"assignedInboxTeamId" text,
	"chatbotId" text NOT NULL,
	"contactId" text NOT NULL,
	"inboxId" text NOT NULL,
	"adminRepliedAt" timestamp(3),
	"contactRepliedAt" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "ConversationParticipant" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"conversationId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Field" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"customFieldType" "CustomFieldType" NOT NULL,
	"description" text,
	"folderId" text,
	"fieldType" "FieldType" NOT NULL,
	"value" text,
	"showInInbox" boolean NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Flow" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"enableInInbox" boolean DEFAULT true NOT NULL,
	"currentVersionId" text,
	"draftVersionId" text,
	"chatbotId" text NOT NULL,
	"folderId" text
);
--> statement-breakpoint
CREATE TABLE "FlowRun" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"flowId" text NOT NULL,
	"flowVersionId" text NOT NULL,
	"conversationId" text
);
--> statement-breakpoint
CREATE TABLE "FlowVersion" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"flowId" text NOT NULL,
	"nodes" jsonb NOT NULL,
	"edges" jsonb NOT NULL,
	"isDraft" boolean NOT NULL,
	"isLatest" boolean DEFAULT false NOT NULL,
	"startNodeId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Folder" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"folderType" "FolderType" NOT NULL,
	"parentId" text,
	"chatbotId" text NOT NULL,
	"isTrash" boolean DEFAULT false NOT NULL,
	"paths" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Inbox" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"inboxType" "InboxType" NOT NULL,
	"sourceId" text NOT NULL,
	"chatbotId" text NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InboxTeamMember" (
	"id" text PRIMARY KEY,
	"chatbotId" text NOT NULL,
	"inboxTeamId" text NOT NULL,
	"userId" text NOT NULL,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InboxTeam" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationGemini" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"autoReply" boolean DEFAULT false NOT NULL,
	"chatbotId" text NOT NULL,
	"integrationId" text NOT NULL,
	"maxOutputTokens" integer NOT NULL,
	"model" text NOT NULL,
	"prompt" text,
	"temperature" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationGoogleSheets" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"integrationId" text NOT NULL,
	"auth" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationMessenger" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"pageId" text NOT NULL,
	"name" text NOT NULL,
	"chatbotId" text NOT NULL,
	"inboxId" text NOT NULL,
	"fallbackFlowId" text
);
--> statement-breakpoint
CREATE TABLE "Integration" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"integrationType" "IntegrationType" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationOpenAI" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"autoReply" boolean DEFAULT true NOT NULL,
	"autoReplyVoice" boolean DEFAULT false NOT NULL,
	"voice" text,
	"prompt" text,
	"model" text NOT NULL,
	"temperature" double precision NOT NULL,
	"maxOutputTokens" integer NOT NULL,
	"chatbotId" text NOT NULL,
	"integrationId" text NOT NULL,
	"aiAssistantId" text,
	"aiAgentId" text
);
--> statement-breakpoint
CREATE TABLE "IntegrationWebchat" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"name" text NOT NULL,
	"enable" boolean DEFAULT true NOT NULL,
	"authorizedDomains" text[] NOT NULL,
	"conversationStarters" jsonb[] NOT NULL,
	"persistentMenus" jsonb[] NOT NULL,
	"brandColor" text DEFAULT '#007bff' NOT NULL,
	"hideHeader" boolean DEFAULT false NOT NULL,
	"showLogo" boolean DEFAULT false NOT NULL,
	"hideMessageInput" boolean DEFAULT false NOT NULL,
	"customCss" text,
	"chatbotId" text NOT NULL,
	"inboxId" text NOT NULL,
	"welcomeFlowId" text
);
--> statement-breakpoint
CREATE TABLE "IntegrationWhatsapp" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"phoneNumberId" text NOT NULL,
	"wabaId" text NOT NULL,
	"businessId" text NOT NULL,
	"name" text NOT NULL,
	"chatbotId" text NOT NULL,
	"inboxId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationZalo" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"oaId" text NOT NULL,
	"name" text NOT NULL,
	"chatbotId" text NOT NULL,
	"inboxId" text NOT NULL,
	"fallbackFlowId" text
);
--> statement-breakpoint
CREATE TABLE "Invitation" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"organizationId" text NOT NULL,
	"chatbotId" text,
	"invitedBy" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Log" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"logType" "LogType" NOT NULL,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"url" text,
	"chatbotId" text NOT NULL,
	"userId" text,
	"contactId" text
);
--> statement-breakpoint
CREATE TABLE "Message" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"conversationId" text NOT NULL,
	"inboxId" text NOT NULL,
	"chatbotId" text NOT NULL,
	"content" text,
	"contentAttributes" jsonb,
	"messageType" "MessageType" NOT NULL,
	"contentType" "ContentType" NOT NULL,
	"senderType" "SenderType" NOT NULL,
	"senderId" text,
	"sourceId" text
);
--> statement-breakpoint
CREATE TABLE "OrganizationMember" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Organization" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"logo" text,
	"metadata" text,
	"domain" text,
	"supportEmail" text,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"defaultMaxContacts" integer DEFAULT 999999999 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_prisma_migrations" (
	"id" varchar(36) PRIMARY KEY,
	"checksum" varchar(64) NOT NULL,
	"finished_at" timestamp with time zone,
	"migration_name" varchar(255) NOT NULL,
	"logs" text,
	"rolled_back_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_steps_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"token" text NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Spreadsheet" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"chatbotId" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"spreadsheetId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Tag" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"folderId" text,
	"syncToMessenger" boolean DEFAULT false NOT NULL,
	"chatbotId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"isAnonymous" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp(3) NOT NULL,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WhatsappFlow" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"integrationWhatsappId" text NOT NULL,
	"sourceId" text NOT NULL,
	"status" text NOT NULL,
	"isCompleted" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WhatsappMessageTemplate" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"integrationWhatsappId" text NOT NULL,
	"sourceId" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "AIEmbedding_chatbotId_idx" ON "AIEmbedding" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "_AITriggerToIntegrationOpenAI_B_index" ON "_AITriggerToIntegrationOpenAI" ("B" text_ops);--> statement-breakpoint
CREATE INDEX "Attachment_chatbotId_idx" ON "Attachment" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "Attachment_messageId_idx" ON "Attachment" ("messageId" text_ops);--> statement-breakpoint
CREATE INDEX "AutomatedResponse_chatbotId_idx" ON "AutomatedResponse" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "Broadcast_chatbotId_idx" ON "Broadcast" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "Broadcast_flowId_idx" ON "Broadcast" ("flowId" text_ops);--> statement-breakpoint
CREATE INDEX "Broadcast_inboxType_idx" ON "Broadcast" ("inboxType" text_ops);--> statement-breakpoint
CREATE INDEX "Broadcast_schedulesAt_idx" ON "Broadcast" ("schedulesAt" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ChatbotUsage_chatbotId_key" ON "ChatbotUsage" ("chatbotId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ContactCustomField_contactId_customFieldId_key" ON "ContactCustomField" ("contactId" text_ops,"customFieldId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Contact_chatbotId_sourceId_key" ON "Contact" ("chatbotId" text_ops,"sourceId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "_ContactToTag_contactId_tagId_key" ON "_ContactToTag" ("contactId" text_ops,"tagId" text_ops);--> statement-breakpoint
CREATE INDEX "Conversation_chatbotId_sourceId_idx" ON "Conversation" ("chatbotId" text_ops,"sourceId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Conversation_contactId_key" ON "Conversation" ("contactId" text_ops);--> statement-breakpoint
CREATE INDEX "ConversationParticipant_chatbotId_idx" ON "ConversationParticipant" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "ConversationParticipant_conversationId_idx" ON "ConversationParticipant" ("conversationId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant" ("conversationId" text_ops,"userId" text_ops);--> statement-breakpoint
CREATE INDEX "Folder_chatbotId_idx" ON "Folder" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "Folder_parentId_idx" ON "Folder" ("parentId" text_ops);--> statement-breakpoint
CREATE INDEX "Inbox_chatbotId_idx" ON "Inbox" ("chatbotId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGemini_chatbotId_key" ON "IntegrationGemini" ("chatbotId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGemini_integrationId_key" ON "IntegrationGemini" ("integrationId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGoogleSheets_integrationId_key" ON "IntegrationGoogleSheets" ("integrationId" text_ops);--> statement-breakpoint
CREATE INDEX "IntegrationMessenger_chatbotId_idx" ON "IntegrationMessenger" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "IntegrationMessenger_fallbackFlowId_idx" ON "IntegrationMessenger" ("fallbackFlowId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationMessenger_inboxId_key" ON "IntegrationMessenger" ("inboxId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationMessenger_pageId_key" ON "IntegrationMessenger" ("pageId" text_ops);--> statement-breakpoint
CREATE INDEX "Integration_chatbotId_idx" ON "Integration" ("chatbotId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationOpenAI_integrationId_key" ON "IntegrationOpenAI" ("integrationId" text_ops);--> statement-breakpoint
CREATE INDEX "IntegrationWebchat_chatbotId_idx" ON "IntegrationWebchat" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "IntegrationWebchat_inboxId_idx" ON "IntegrationWebchat" ("inboxId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationWebchat_inboxId_key" ON "IntegrationWebchat" ("inboxId" text_ops);--> statement-breakpoint
CREATE INDEX "IntegrationWebchat_welcomeFlowId_idx" ON "IntegrationWebchat" ("welcomeFlowId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationWhatsapp_inboxId_key" ON "IntegrationWhatsapp" ("inboxId" text_ops);--> statement-breakpoint
CREATE INDEX "IntegrationZalo_chatbotId_idx" ON "IntegrationZalo" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "IntegrationZalo_fallbackFlowId_idx" ON "IntegrationZalo" ("fallbackFlowId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationZalo_inboxId_key" ON "IntegrationZalo" ("inboxId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Invitation_code_key" ON "Invitation" ("code" text_ops);--> statement-breakpoint
CREATE INDEX "Message_chatbotId_idx" ON "Message" ("chatbotId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Message_chatbotId_sourceId_key" ON "Message" ("chatbotId" text_ops,"sourceId" text_ops);--> statement-breakpoint
CREATE INDEX "Message_conversationId_idx" ON "Message" ("conversationId" text_ops);--> statement-breakpoint
CREATE INDEX "Message_inboxId_idx" ON "Message" ("inboxId" text_ops);--> statement-breakpoint
CREATE INDEX "Message_senderType_senderId_idx" ON "Message" ("senderType" enum_ops,"senderId" text_ops);--> statement-breakpoint
CREATE INDEX "Organization_domain_idx" ON "Organization" ("domain" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization" ("slug" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Session_token_key" ON "Session" ("token" text_ops);--> statement-breakpoint
CREATE INDEX "Spreadsheet_chatbotId_idx" ON "Spreadsheet" ("chatbotId" text_ops);--> statement-breakpoint
CREATE INDEX "Spreadsheet_chatbotId_spreadsheetId_idx" ON "Spreadsheet" ("chatbotId" text_ops,"spreadsheetId" text_ops);--> statement-breakpoint
CREATE INDEX "Spreadsheet_spreadsheetId_idx" ON "Spreadsheet" ("spreadsheetId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "Tag_chatbotId_name_key" ON "Tag" ("chatbotId" text_ops,"name" text_ops);--> statement-breakpoint
CREATE INDEX "Tag_folderId_idx" ON "Tag" ("folderId" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_key" ON "User" ("email" text_ops);--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIAgent" ADD CONSTRAINT "AIAgent_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIAssistant" ADD CONSTRAINT "AIAssistant_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIEmbedding" ADD CONSTRAINT "AIEmbedding_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIEmbedding" ADD CONSTRAINT "AIEmbedding_aiFileId_fkey" FOREIGN KEY ("aiFileId") REFERENCES "AIFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIFile" ADD CONSTRAINT "AIFile_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIFunction" ADD CONSTRAINT "AIFunction_triggerFlowId_fkey" FOREIGN KEY ("triggerFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIFunction" ADD CONSTRAINT "AIFunction_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIMCPServer" ADD CONSTRAINT "AIMCPServer_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AITrigger" ADD CONSTRAINT "AITrigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "_AITriggerToIntegrationOpenAI" ADD CONSTRAINT "_AITriggerToIntegrationOpenAI_A_fkey" FOREIGN KEY ("A") REFERENCES "AITrigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "_AITriggerToIntegrationOpenAI" ADD CONSTRAINT "_AITriggerToIntegrationOpenAI_B_fkey" FOREIGN KEY ("B") REFERENCES "IntegrationOpenAI"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ADD CONSTRAINT "AutomatedResponse_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ChatbotMember" ADD CONSTRAINT "ChatbotMember_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ChatbotMember" ADD CONSTRAINT "ChatbotMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Chatbot" ADD CONSTRAINT "Chatbot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ChatbotUsage" ADD CONSTRAINT "ChatbotUsage_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactCustomField" ADD CONSTRAINT "ContactCustomField_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactCustomField" ADD CONSTRAINT "ContactCustomField_customFieldId_fkey" FOREIGN KEY ("customFieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactsOnBroadcasts" ADD CONSTRAINT "ContactsOnBroadcasts_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactsOnBroadcasts" ADD CONSTRAINT "ContactsOnBroadcasts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "_ContactToTag" ADD CONSTRAINT "_ContactToTag_A_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "_ContactToTag" ADD CONSTRAINT "_ContactToTag_B_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedInboxTeamId_fkey" FOREIGN KEY ("assignedInboxTeamId") REFERENCES "InboxTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Field" ADD CONSTRAINT "Field_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Field" ADD CONSTRAINT "Field_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowVersionId_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Inbox" ADD CONSTRAINT "Inbox_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboxTeamMember" ADD CONSTRAINT "InboxTeamMember_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboxTeamMember" ADD CONSTRAINT "InboxTeamMember_inboxTeamId_fkey" FOREIGN KEY ("inboxTeamId") REFERENCES "InboxTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboxTeamMember" ADD CONSTRAINT "InboxTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboxTeam" ADD CONSTRAINT "InboxTeam_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGemini" ADD CONSTRAINT "IntegrationGemini_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGemini" ADD CONSTRAINT "IntegrationGemini_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleSheets" ADD CONSTRAINT "IntegrationGoogleSheets_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleSheets" ADD CONSTRAINT "IntegrationGoogleSheets_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_fallbackFlowId_fkey" FOREIGN KEY ("fallbackFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_aiAssistantId_fkey" FOREIGN KEY ("aiAssistantId") REFERENCES "AIAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenAI" ADD CONSTRAINT "IntegrationOpenAI_aiAgentId_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_welcomeFlowId_fkey" FOREIGN KEY ("welcomeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_fallbackFlowId_fkey" FOREIGN KEY ("fallbackFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Log" ADD CONSTRAINT "Log_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Log" ADD CONSTRAINT "Log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Log" ADD CONSTRAINT "Log_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Spreadsheet" ADD CONSTRAINT "Spreadsheet_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappFlow" ADD CONSTRAINT "WhatsappFlow_integrationWhatsappId_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappMessageTemplate" ADD CONSTRAINT "WhatsappMessageTemplate_integrationWhatsappId_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
