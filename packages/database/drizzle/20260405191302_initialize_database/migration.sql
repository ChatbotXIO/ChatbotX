CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE TYPE "aiEmbeddingStatus" AS ENUM('pending', 'success', 'error', 'processing');--> statement-breakpoint
CREATE TYPE "analyticsStatus" AS ENUM('processing', 'ingested', 'failed');--> statement-breakpoint
CREATE TYPE "fileType" AS ENUM('image', 'video', 'audio', 'gif', 'file');--> statement-breakpoint
CREATE TYPE "broadcastScheduleType" AS ENUM('now', 'future');--> statement-breakpoint
CREATE TYPE "broadcastStatus" AS ENUM('scheduled', 'sent');--> statement-breakpoint
CREATE TYPE "gender" AS ENUM('male', 'female', 'unknown');--> statement-breakpoint
CREATE TYPE "customFieldType" AS ENUM('shortText', 'number', 'date', 'datetime', 'boolean', 'longText');--> statement-breakpoint
CREATE TYPE "folderType" AS ENUM('tag', 'flow', 'customField', 'automatedResponse', 'trigger', 'webhook', 'sequence');--> statement-breakpoint
CREATE TYPE "contentType" AS ENUM('text', 'location');--> statement-breakpoint
CREATE TYPE "messageType" AS ENUM('incoming', 'outgoing', 'activity');--> statement-breakpoint
CREATE TYPE "senderType" AS ENUM('bot', 'contact', 'system', 'user', 'api');--> statement-breakpoint
CREATE TYPE "workspaceMemberRole" AS ENUM('owner', 'agent');--> statement-breakpoint
CREATE TABLE "AIAgent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
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
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"aiTriggerIds" text[] NOT NULL,
	"attachmentIds" text[] NOT NULL,
	"temperature" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIEmbedding" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"status" "aiEmbeddingStatus" DEFAULT 'pending'::"aiEmbeddingStatus" NOT NULL,
	"workspaceId" bigint NOT NULL,
	"aiFileId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIFile" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"size" integer NOT NULL,
	"mimeType" text NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIFunction" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"purpose" text,
	"dataCollect" jsonb,
	"outputMessage" text,
	"triggerFlowId" bigint,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AIMCPServer" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"auth" jsonb NOT NULL,
	"availableTools" jsonb NOT NULL,
	"selectedTools" text[] NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AITrigger" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"flowId" bigint,
	"questions" jsonb[] NOT NULL,
	"finalMessage" text
);
--> statement-breakpoint
CREATE TABLE "AITriggerToIntegrationOpenai" (
	"aiTriggerId" bigint,
	"integrationOpenaiId" bigint,
	CONSTRAINT "AITriggerToIntegrationOpenai_pkey" PRIMARY KEY("aiTriggerId","integrationOpenaiId")
);
--> statement-breakpoint
CREATE TABLE "AnalyticsManifestStatus" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"status" "analyticsStatus" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ingestedAt" timestamp,
	"lastError" text
);
--> statement-breakpoint
CREATE TABLE "Attachment" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"fileType" "fileType" NOT NULL,
	"messageId" bigint NOT NULL,
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
CREATE TABLE "Account" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"accessTokenExpiresAt" timestamp(6) with time zone,
	"refreshToken" text,
	"refreshTokenExpiresAt" timestamp(6) with time zone,
	"scope" text,
	"idToken" text,
	"password" text,
	"userId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Invitation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"organizationId" bigint NOT NULL,
	"workspaceId" bigint,
	"invitedBy" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Jwk" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"publicKey" text NOT NULL,
	"privateKey" text NOT NULL,
	"expiresAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"token" text NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"isAnonymous" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Verification" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AutomatedResponse" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"folderId" bigint,
	"userMessages" text[] NOT NULL,
	"status" boolean NOT NULL,
	"text" text,
	"flowId" bigint
);
--> statement-breakpoint
CREATE TABLE "BotField" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"type" "customFieldType" NOT NULL,
	"value" text,
	"description" text,
	"folderId" bigint,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Broadcast" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint,
	"integrationWhatsappId" bigint,
	"templateId" bigint,
	"templateData" jsonb,
	"status" "broadcastStatus" NOT NULL,
	"schedulesType" "broadcastScheduleType" NOT NULL,
	"schedulesAt" timestamp(6) with time zone NOT NULL,
	"contactFilter" jsonb,
	"subaction" text NOT NULL,
	"channel" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Contact" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"avatar" text,
	"phoneNumber" text,
	"email" text,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"emailOptIn" boolean DEFAULT false NOT NULL,
	"firstName" text,
	"lastName" text,
	"gender" "gender",
	"lastReadAt" timestamp(6) with time zone,
	"ref" text,
	"country" text,
	"state" text,
	"city" text,
	"location" jsonb,
	"locale" text,
	"timezone" text,
	"subscribedAt" timestamp(6) with time zone,
	"blockedAt" timestamp(6) with time zone,
	"workspaceId" bigint NOT NULL,
	"lastActivityAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContactCustomField" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"value" text NOT NULL,
	"contactId" bigint NOT NULL,
	"customFieldId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContactInbox" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"originalContactId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"channel" text NOT NULL,
	"source" text NOT NULL,
	"sourceId" text NOT NULL,
	"lastMessageAt" timestamp(6) with time zone,
	"lastIncomingMessageAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "ContactNote" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"text" text NOT NULL,
	"contactId" bigint NOT NULL,
	"createdById" bigint
);
--> statement-breakpoint
CREATE TABLE "ContactOnBroadcast" (
	"broadcastId" bigint,
	"contactId" bigint,
	"sent" boolean DEFAULT false NOT NULL,
	"delivered" boolean DEFAULT false NOT NULL,
	"seen" boolean DEFAULT false NOT NULL,
	"clicked" boolean DEFAULT false NOT NULL,
	"failed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ContactsOnBroadcast_pkey" PRIMARY KEY("broadcastId","contactId")
);
--> statement-breakpoint
CREATE TABLE "ContactOnSequence" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"enrolledAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp(6) with time zone,
	"currentStep" integer DEFAULT 0 NOT NULL,
	"status" text,
	"nextRunAt" timestamp(6) with time zone,
	"lastStepId" bigint,
	"nextStepId" bigint,
	"lockedAt" timestamp(6) with time zone,
	"lockOwner" text,
	"errorCount" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"contactId" bigint NOT NULL,
	"sequenceId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ContactToTag" (
	"contactId" bigint,
	"tagId" bigint,
	CONSTRAINT "ContactToTag_pkey" PRIMARY KEY("contactId","tagId")
);
--> statement-breakpoint
CREATE TABLE "Conversation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"botEnabled" boolean DEFAULT false NOT NULL,
	"archivedAt" timestamp(6) with time zone,
	"additionalAttributes" jsonb,
	"contactLastReadAt" timestamp(6) with time zone,
	"agentLastReadAt" timestamp(6) with time zone,
	"lastActivityAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"followed" boolean DEFAULT false NOT NULL,
	"assignedUserId" bigint,
	"assignedInboxTeamId" bigint,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"adminRepliedAt" timestamp(6) with time zone,
	"contactRepliedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "ConversationParticipant" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"userId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "CustomField" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"type" "customFieldType" NOT NULL,
	"description" text,
	"folderId" bigint,
	"showInInbox" boolean DEFAULT false NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuditLog" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"userId" bigint
);
--> statement-breakpoint
CREATE TABLE "Plan" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"priceId" text NOT NULL,
	"annualDiscountPrice" integer,
	"annualDiscountPriceId" text,
	"limits" jsonb NOT NULL,
	"freeTrial" jsonb,
	"currency" text NOT NULL,
	"marketingFeatures" text[] DEFAULT '{}'::text[] NOT NULL,
	"organizationId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Subscription" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"plan" text NOT NULL,
	"referenceId" text NOT NULL,
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"status" text NOT NULL,
	"periodStart" timestamp(6) with time zone,
	"periodEnd" timestamp(6) with time zone,
	"cancelAtPeriodEnd" boolean,
	"cancelAt" timestamp(6) with time zone,
	"canceledAt" timestamp(6) with time zone,
	"endedAt" timestamp(6) with time zone,
	"seats" integer,
	"trialStart" timestamp(6) with time zone,
	"trialEnd" timestamp(6) with time zone,
	"billingInterval" text,
	"stripeScheduleId" text
);
--> statement-breakpoint
CREATE TABLE "ErrorLog" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"httpCode" text,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint
);
--> statement-breakpoint
CREATE TABLE "Flow" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"enableInInbox" boolean DEFAULT true NOT NULL,
	"currentVersionId" bigint,
	"draftVersionId" bigint,
	"workspaceId" bigint NOT NULL,
	"folderId" bigint
);
--> statement-breakpoint
CREATE TABLE "FlowRun" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint NOT NULL,
	"flowVersionId" bigint NOT NULL,
	"conversationId" bigint
);
--> statement-breakpoint
CREATE TABLE "FlowVersion" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint NOT NULL,
	"nodes" jsonb[] NOT NULL,
	"edges" jsonb[] NOT NULL,
	"isDraft" boolean NOT NULL,
	"isLatest" boolean DEFAULT false NOT NULL,
	"startNodeId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Folder" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"folderType" "folderType" NOT NULL,
	"parentId" bigint,
	"workspaceId" bigint NOT NULL,
	"isTrash" boolean DEFAULT false NOT NULL,
	"paths" bigint[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Inbox" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"channel" text NOT NULL,
	"sourceId" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"status" text DEFAULT 'connected' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InboxContactStat" (
	"inboxId" bigint PRIMARY KEY,
	"totalContacts" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InboxTeam" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "InboxTeamMember" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"inboxTeamId" bigint NOT NULL,
	"userId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Integration" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationType" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationGemini" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"autoReply" boolean DEFAULT false NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"maxOutputTokens" integer NOT NULL,
	"model" text NOT NULL,
	"prompt" text,
	"temperature" double precision
);
--> statement-breakpoint
CREATE TABLE "IntegrationGoogleSheet" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"auth" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationMessenger" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"pageId" text NOT NULL,
	"name" text NOT NULL,
	"conversationStarters" jsonb NOT NULL,
	"persistentMenus" jsonb NOT NULL,
	"greetingMessages" jsonb NOT NULL,
	"personas" jsonb NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"welcomeFlowId" bigint
);
--> statement-breakpoint
CREATE TABLE "IntegrationOpenai" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"autoReply" boolean DEFAULT true NOT NULL,
	"autoReplyVoice" boolean DEFAULT false NOT NULL,
	"voice" text,
	"prompt" text,
	"model" text NOT NULL,
	"temperature" double precision,
	"maxOutputTokens" integer NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"aiAssistantId" bigint,
	"aiAgentId" bigint
);
--> statement-breakpoint
CREATE TABLE "IntegrationWebchat" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"name" text NOT NULL,
	"enable" boolean DEFAULT true NOT NULL,
	"authorizedDomains" text[] NOT NULL,
	"conversationStarters" jsonb[] NOT NULL,
	"persistentMenus" jsonb[] NOT NULL,
	"brandColor" text NOT NULL,
	"hideHeader" boolean DEFAULT false NOT NULL,
	"showLogo" boolean DEFAULT false NOT NULL,
	"hideMessageInput" boolean DEFAULT false NOT NULL,
	"customCss" text,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"welcomeFlowId" bigint
);
--> statement-breakpoint
CREATE TABLE "IntegrationWhatsapp" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"phoneNumberId" text NOT NULL,
	"wabaId" text NOT NULL,
	"businessId" text NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IntegrationZalo" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"oaId" text NOT NULL,
	"name" text NOT NULL,
	"workspaceId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"fallbackFlowId" bigint
);
--> statement-breakpoint
CREATE TABLE "Message" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"conversationId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"text" text,
	"contentAttributes" jsonb,
	"messageType" "messageType" NOT NULL,
	"contentType" "contentType" NOT NULL,
	"senderType" "senderType" NOT NULL,
	"senderId" bigint,
	"sourceId" text
);
--> statement-breakpoint
CREATE TABLE "Organization" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
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
CREATE TABLE "OrganizationMember" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"role" text NOT NULL,
	"organizationId" bigint NOT NULL,
	"userId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Reflink" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"flowId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"customFieldId" bigint
);
--> statement-breakpoint
CREATE TABLE "SavedReply" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"shortcut" text NOT NULL,
	"text" text NOT NULL,
	"userId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Sequence" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"folderId" bigint,
	"active" boolean DEFAULT true NOT NULL,
	"subscribers" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"openRate" double precision,
	"ctr" double precision,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SequenceDispatch" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"runAtMs" integer NOT NULL,
	"bucket" integer DEFAULT 0 NOT NULL,
	"status" text,
	"idempotencyKey" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"lockedAt" timestamp(6) with time zone,
	"lockOwner" text,
	"completedAt" timestamp(6) with time zone,
	"workspaceId" bigint NOT NULL,
	"sequenceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"stepId" bigint NOT NULL,
	"enrollmentId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "SequenceStep" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"order" integer NOT NULL,
	"delayDays" integer NOT NULL,
	"delayMinutes" integer DEFAULT 0 NOT NULL,
	"delayUnit" text,
	"specificDateTime" timestamp(6) with time zone,
	"isActive" boolean DEFAULT true NOT NULL,
	"anytime" boolean DEFAULT true NOT NULL,
	"sendTimeStart" text,
	"sendTimeEnd" text,
	"sendDays" text DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]',
	"flowId" bigint,
	"sequenceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Spreadsheet" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"spreadsheetId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Tag" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"folderId" bigint,
	"syncToMessenger" boolean DEFAULT false NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Trigger" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"folderId" bigint,
	"actions" jsonb[] NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Condition" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"triggerId" bigint,
	"webhookId" bigint,
	"type" text NOT NULL,
	"sourceId" text,
	"operator" varchar(255),
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "TriggerContactHistory" (
	"id" bigint,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"triggerId" bigint NOT NULL,
	"contactId" bigint,
	"workspaceId" bigint NOT NULL,
	"firstEnteredAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "TriggerContactHistory_pkey" PRIMARY KEY("id","contactId")
);
--> statement-breakpoint
CREATE TABLE "TriggerExecution" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"executedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"triggerId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "TriggerStat" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"triggerId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"date" timestamp(6) with time zone NOT NULL,
	"totalContacts" integer DEFAULT 0 NOT NULL,
	"successCount" integer DEFAULT 0 NOT NULL,
	"failureCount" integer DEFAULT 0 NOT NULL,
	"totalExecutions" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Webhook" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"folderId" bigint,
	"url" text NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WhatsappFlow" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"integrationWhatsappId" bigint NOT NULL,
	"sourceId" text NOT NULL,
	"status" text NOT NULL,
	"isCompleted" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WhatsappMessageTemplate" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"integrationWhatsappId" bigint NOT NULL,
	"sourceId" text NOT NULL,
	"language" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"components" jsonb DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Workspace" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"defaultReply" text,
	"targetCountry" text,
	"language" text DEFAULT 'en' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"brandColor" text DEFAULT '#016DFF' NOT NULL,
	"developmentMode" boolean DEFAULT false NOT NULL,
	"logo" text,
	"organizationId" bigint NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"token" text
);
--> statement-breakpoint
CREATE TABLE "WorkspaceMember" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"userId" bigint NOT NULL,
	"role" "workspaceMemberRole" NOT NULL,
	"notificationChannels" jsonb DEFAULT '{}' NOT NULL,
	"notificationTypes" jsonb DEFAULT '{}' NOT NULL,
	"permissions" jsonb DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WorkspaceUsage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"contactsCount" integer DEFAULT 0 NOT NULL,
	"maxContacts" integer DEFAULT 0 NOT NULL,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE INDEX "AIEmbedding_workspaceId_idx" ON "AIEmbedding" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Attachment_workspaceId_idx" ON "Attachment" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Attachment_messageId_idx" ON "Attachment" ("messageId");--> statement-breakpoint
CREATE UNIQUE INDEX "Invitation_code_key" ON "Invitation" ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "Session_token_key" ON "Session" ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");--> statement-breakpoint
CREATE INDEX "AutomatedResponse_workspaceId_idx" ON "AutomatedResponse" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "BotField_workspaceId_type_name_key" ON "BotField" ("workspaceId","type","name");--> statement-breakpoint
CREATE INDEX "Broadcast_workspaceId_idx" ON "Broadcast" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Broadcast_flowId_idx" ON "Broadcast" ("flowId");--> statement-breakpoint
CREATE INDEX "Broadcast_channel_idx" ON "Broadcast" ("channel");--> statement-breakpoint
CREATE INDEX "Broadcast_schedulesAt_idx" ON "Broadcast" ("schedulesAt");--> statement-breakpoint
CREATE UNIQUE INDEX "ContactCustomField_contactId_customFieldId_key" ON "ContactCustomField" ("contactId","customFieldId");--> statement-breakpoint
CREATE UNIQUE INDEX "ContactInbox_channel_sourceId_key" ON "ContactInbox" ("channel","sourceId");--> statement-breakpoint
CREATE INDEX "ContactsOnSequence_sequenceId_idx" ON "ContactOnSequence" ("sequenceId");--> statement-breakpoint
CREATE INDEX "ContactsOnSequence_contactId_idx" ON "ContactOnSequence" ("contactId");--> statement-breakpoint
CREATE INDEX "ContactsOnSequence_workspaceId_idx" ON "ContactOnSequence" ("workspaceId");--> statement-breakpoint
CREATE INDEX "ContactsOnSequence_status_nextRunAt_idx" ON "ContactOnSequence" ("status","nextRunAt");--> statement-breakpoint
CREATE INDEX "ContactsOnSequence_workspaceId_status_nextRunAt_idx" ON "ContactOnSequence" ("workspaceId","status","nextRunAt");--> statement-breakpoint
CREATE UNIQUE INDEX "ContactsOnSequence_contactId_sequenceId_workspaceId_key" ON "ContactOnSequence" ("contactId","sequenceId","workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Conversation_contactId_key" ON "Conversation" ("contactId");--> statement-breakpoint
CREATE INDEX "ConversationParticipant_workspaceId_idx" ON "ConversationParticipant" ("workspaceId");--> statement-breakpoint
CREATE INDEX "ConversationParticipant_conversationId_idx" ON "ConversationParticipant" ("conversationId");--> statement-breakpoint
CREATE UNIQUE INDEX "ConversationParticipant_conversationId_userId_key" ON "ConversationParticipant" ("conversationId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "CustomField_workspaceId_type_name_key" ON "CustomField" ("workspaceId","type","name");--> statement-breakpoint
CREATE INDEX "Folder_workspaceId_idx" ON "Folder" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Folder_parentId_idx" ON "Folder" ("parentId");--> statement-breakpoint
CREATE INDEX "Inbox_workspaceId_idx" ON "Inbox" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Inbox_workspaceId_channel_sourceId_key" ON "Inbox" ("channel","sourceId");--> statement-breakpoint
CREATE INDEX "Integration_workspaceId_idx" ON "Integration" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Integration_workspaceId_integrationType_key" ON "Integration" ("workspaceId","integrationType");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGemini_workspaceId_key" ON "IntegrationGemini" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGemini_integrationId_key" ON "IntegrationGemini" ("integrationId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationGoogleSheet_integrationId_key" ON "IntegrationGoogleSheet" ("integrationId");--> statement-breakpoint
CREATE INDEX "IntegrationMessenger_workspaceId_idx" ON "IntegrationMessenger" ("workspaceId");--> statement-breakpoint
CREATE INDEX "IntegrationMessenger_welcomeFlowId_idx" ON "IntegrationMessenger" ("welcomeFlowId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationMessenger_inboxId_key" ON "IntegrationMessenger" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationMessenger_pageId_key" ON "IntegrationMessenger" ("pageId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationOpenAI_integrationId_key" ON "IntegrationOpenai" ("integrationId");--> statement-breakpoint
CREATE INDEX "IntegrationWebchat_workspaceId_idx" ON "IntegrationWebchat" ("workspaceId");--> statement-breakpoint
CREATE INDEX "IntegrationWebchat_inboxId_idx" ON "IntegrationWebchat" ("inboxId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationWebchat_inboxId_key" ON "IntegrationWebchat" ("inboxId");--> statement-breakpoint
CREATE INDEX "IntegrationWebchat_welcomeFlowId_idx" ON "IntegrationWebchat" ("welcomeFlowId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationWhatsapp_inboxId_key" ON "IntegrationWhatsapp" ("inboxId");--> statement-breakpoint
CREATE INDEX "IntegrationZalo_workspaceId_idx" ON "IntegrationZalo" ("workspaceId");--> statement-breakpoint
CREATE INDEX "IntegrationZalo_fallbackFlowId_idx" ON "IntegrationZalo" ("fallbackFlowId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationZalo_inboxId_key" ON "IntegrationZalo" ("inboxId");--> statement-breakpoint
CREATE INDEX "Message_workspaceId_idx" ON "Message" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Message_contactInboxId_sourceId_key" ON "Message" ("contactInboxId","sourceId");--> statement-breakpoint
CREATE INDEX "Message_conversationId_idx" ON "Message" ("conversationId");--> statement-breakpoint
CREATE INDEX "Message_inboxId_idx" ON "Message" ("contactInboxId");--> statement-breakpoint
CREATE INDEX "Message_senderType_senderId_idx" ON "Message" ("senderType","senderId");--> statement-breakpoint
CREATE INDEX "Organization_domain_idx" ON "Organization" ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization" ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "Reflink_workspaceId_name_key" ON "Reflink" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "Sequence_folderId_idx" ON "Sequence" ("folderId");--> statement-breakpoint
CREATE UNIQUE INDEX "Sequence_workspaceId_name_key" ON "Sequence" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_status_runAtMs_idx" ON "SequenceDispatch" ("status","runAtMs");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_workspaceId_status_runAtMs_idx" ON "SequenceDispatch" ("workspaceId","status","runAtMs");--> statement-breakpoint
CREATE UNIQUE INDEX "SequenceDispatch_idempotencyKey_key" ON "SequenceDispatch" ("idempotencyKey","workspaceId");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_enrollmentId_idx" ON "SequenceDispatch" ("enrollmentId");--> statement-breakpoint
CREATE INDEX "SequenceDispatch_bucket_status_runAtMs_idx" ON "SequenceDispatch" ("bucket","status","runAtMs");--> statement-breakpoint
CREATE INDEX "SequenceStep_sequenceId_idx" ON "SequenceStep" ("sequenceId");--> statement-breakpoint
CREATE INDEX "SequenceStep_flowId_idx" ON "SequenceStep" ("flowId");--> statement-breakpoint
CREATE INDEX "Spreadsheet_workspaceId_idx" ON "Spreadsheet" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Spreadsheet_workspaceId_spreadsheetId_idx" ON "Spreadsheet" ("workspaceId","spreadsheetId");--> statement-breakpoint
CREATE INDEX "Spreadsheet_spreadsheetId_idx" ON "Spreadsheet" ("spreadsheetId");--> statement-breakpoint
CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "Tag" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "Tag_folderId_idx" ON "Tag" ("folderId");--> statement-breakpoint
CREATE UNIQUE INDEX "Trigger_workspaceId_name_key" ON "Trigger" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "Trigger_workspaceId_idx" ON "Trigger" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Trigger_folderId_idx" ON "Trigger" ("folderId");--> statement-breakpoint
CREATE INDEX "Trigger_workspaceId_active_idx" ON "Trigger" ("workspaceId","active");--> statement-breakpoint
CREATE INDEX "Condition_type_source_id_idx" ON "Condition" ("type","sourceId");--> statement-breakpoint
CREATE INDEX "Condition_triggerId_idx" ON "Condition" ("triggerId");--> statement-breakpoint
CREATE INDEX "Condition_webhookId_idx" ON "Condition" ("webhookId");--> statement-breakpoint
CREATE INDEX "Condition_type_sourceId_triggerId_idx" ON "Condition" ("type","sourceId","triggerId");--> statement-breakpoint
CREATE INDEX "Condition_type_sourceId_webhookId_idx" ON "Condition" ("type","sourceId","webhookId");--> statement-breakpoint
CREATE INDEX "TriggerContactHistory_triggerId_contactId_idx" ON "TriggerContactHistory" ("triggerId","contactId");--> statement-breakpoint
CREATE INDEX "TriggerContactHistory_contactId_idx" ON "TriggerContactHistory" ("contactId");--> statement-breakpoint
CREATE INDEX "TriggerContactHistory_workspaceId_idx" ON "TriggerContactHistory" ("workspaceId");--> statement-breakpoint
CREATE INDEX "TriggerExecution_triggerId_contactId_idx" ON "TriggerExecution" ("triggerId","contactId");--> statement-breakpoint
CREATE INDEX "TriggerExecution_workspaceId_idx" ON "TriggerExecution" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "TriggerStat_triggerId_date_key" ON "TriggerStat" ("triggerId","date");--> statement-breakpoint
CREATE INDEX "TriggerStat_triggerId_date_idx" ON "TriggerStat" ("triggerId","date");--> statement-breakpoint
CREATE INDEX "TriggerStat_workspaceId_date_idx" ON "TriggerStat" ("workspaceId","date");--> statement-breakpoint
CREATE INDEX "Webhook_workspaceId_idx" ON "Webhook" ("workspaceId");--> statement-breakpoint
CREATE INDEX "Webhook_folderId_idx" ON "Webhook" ("folderId");--> statement-breakpoint
CREATE INDEX "Webhook_workspaceId_active_idx" ON "Webhook" ("workspaceId","active");--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappMessageTemplate_integrationWhatsappId_sourceId_key" ON "WhatsappMessageTemplate" ("integrationWhatsappId","sourceId");--> statement-breakpoint
CREATE UNIQUE INDEX "WorkspaceUsage_workspaceId_key" ON "WorkspaceUsage" ("workspaceId");--> statement-breakpoint
ALTER TABLE "AIAgent" ADD CONSTRAINT "AIAgent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIAssistant" ADD CONSTRAINT "AIAssistant_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIEmbedding" ADD CONSTRAINT "AIEmbedding_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIEmbedding" ADD CONSTRAINT "AIEmbedding_aiFileId_AIFile_id_fkey" FOREIGN KEY ("aiFileId") REFERENCES "AIFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIFile" ADD CONSTRAINT "AIFile_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIFunction" ADD CONSTRAINT "AIFunction_triggerFlowId_Flow_id_fkey" FOREIGN KEY ("triggerFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIFunction" ADD CONSTRAINT "AIFunction_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIMCPServer" ADD CONSTRAINT "AIMCPServer_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AITrigger" ADD CONSTRAINT "AITrigger_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AITrigger" ADD CONSTRAINT "AITrigger_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AITriggerToIntegrationOpenai" ADD CONSTRAINT "AITriggerToIntegrationOpenai_aiTriggerId_AITrigger_id_fkey" FOREIGN KEY ("aiTriggerId") REFERENCES "AITrigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AITriggerToIntegrationOpenai" ADD CONSTRAINT "AITriggerToIntegrationOpenai_rSgeY7c25Tng_fkey" FOREIGN KEY ("integrationOpenaiId") REFERENCES "IntegrationOpenai"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_Message_id_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_Organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedBy_User_id_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ADD CONSTRAINT "AutomatedResponse_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ADD CONSTRAINT "AutomatedResponse_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AutomatedResponse" ADD CONSTRAINT "AutomatedResponse_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BotField" ADD CONSTRAINT "BotField_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "BotField" ADD CONSTRAINT "BotField_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_integrationWhatsappId_IntegrationWhatsapp_id_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactCustomField" ADD CONSTRAINT "ContactCustomField_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactCustomField" ADD CONSTRAINT "ContactCustomField_customFieldId_CustomField_id_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactNote" ADD CONSTRAINT "ContactNote_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD CONSTRAINT "ContactOnBroadcast_broadcastId_Broadcast_id_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnBroadcast" ADD CONSTRAINT "ContactOnBroadcast_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnSequence" ADD CONSTRAINT "ContactOnSequence_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnSequence" ADD CONSTRAINT "ContactOnSequence_sequenceId_Sequence_id_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactOnSequence" ADD CONSTRAINT "ContactOnSequence_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactToTag" ADD CONSTRAINT "ContactToTag_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ContactToTag" ADD CONSTRAINT "ContactToTag_tagId_Tag_id_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedUserId_User_id_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedInboxTeamId_InboxTeam_id_fkey" FOREIGN KEY ("assignedInboxTeamId") REFERENCES "InboxTeam"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_flowVersionId_FlowVersion_id_fkey" FOREIGN KEY ("flowVersionId") REFERENCES "FlowVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowRun" ADD CONSTRAINT "FlowRun_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "FlowVersion" ADD CONSTRAINT "FlowVersion_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Inbox" ADD CONSTRAINT "Inbox_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboxContactStat" ADD CONSTRAINT "InboxContactStat_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboxTeam" ADD CONSTRAINT "InboxTeam_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboxTeamMember" ADD CONSTRAINT "InboxTeamMember_inboxTeamId_InboxTeam_id_fkey" FOREIGN KEY ("inboxTeamId") REFERENCES "InboxTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "InboxTeamMember" ADD CONSTRAINT "InboxTeamMember_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGemini" ADD CONSTRAINT "IntegrationGemini_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGemini" ADD CONSTRAINT "IntegrationGemini_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleSheet" ADD CONSTRAINT "IntegrationGoogleSheet_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationGoogleSheet" ADD CONSTRAINT "IntegrationGoogleSheet_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD CONSTRAINT "IntegrationMessenger_welcomeFlowId_Flow_id_fkey" FOREIGN KEY ("welcomeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenai" ADD CONSTRAINT "IntegrationOpenai_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenai" ADD CONSTRAINT "IntegrationOpenai_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenai" ADD CONSTRAINT "IntegrationOpenai_aiAssistantId_AIAssistant_id_fkey" FOREIGN KEY ("aiAssistantId") REFERENCES "AIAssistant"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationOpenai" ADD CONSTRAINT "IntegrationOpenai_aiAgentId_AIAgent_id_fkey" FOREIGN KEY ("aiAgentId") REFERENCES "AIAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWebchat" ADD CONSTRAINT "IntegrationWebchat_welcomeFlowId_Flow_id_fkey" FOREIGN KEY ("welcomeFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationWhatsapp" ADD CONSTRAINT "IntegrationWhatsapp_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_inboxId_Inbox_id_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationZalo" ADD CONSTRAINT "IntegrationZalo_fallbackFlowId_Flow_id_fkey" FOREIGN KEY ("fallbackFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Message" ADD CONSTRAINT "Message_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_Organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Reflink" ADD CONSTRAINT "Reflink_customFieldId_CustomField_id_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SavedReply" ADD CONSTRAINT "SavedReply_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD CONSTRAINT "SequenceDispatch_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD CONSTRAINT "SequenceDispatch_sequenceId_Sequence_id_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD CONSTRAINT "SequenceDispatch_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD CONSTRAINT "SequenceDispatch_stepId_SequenceStep_id_fkey" FOREIGN KEY ("stepId") REFERENCES "SequenceStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceDispatch" ADD CONSTRAINT "SequenceDispatch_enrollmentId_ContactOnSequence_id_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "ContactOnSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_flowId_Flow_id_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_sequenceId_Sequence_id_fkey" FOREIGN KEY ("sequenceId") REFERENCES "Sequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Spreadsheet" ADD CONSTRAINT "Spreadsheet_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_triggerId_Trigger_id_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_webhookId_Webhook_id_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_triggerId_Trigger_id_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_triggerId_Trigger_id_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerStat" ADD CONSTRAINT "TriggerStat_triggerId_Trigger_id_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "TriggerStat" ADD CONSTRAINT "TriggerStat_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_folderId_Folder_id_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappFlow" ADD CONSTRAINT "WhatsappFlow_integrationWhatsappId_IntegrationWhatsapp_id_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WhatsappMessageTemplate" ADD CONSTRAINT "WhatsappMessageTemplate_p6pSomUTTJCm_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_Organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "WorkspaceUsage" ADD CONSTRAINT "WorkspaceUsage_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InboxContactStat" ADD CONSTRAINT "InboxContactStat_inboxId_fkey" FOREIGN KEY ("inboxId") REFERENCES "Inbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION increment_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO "InboxContactStat" ("inboxId", "totalContacts", "updatedAt")
    VALUES (NEW."inboxId", 1, CURRENT_TIMESTAMP)
    ON CONFLICT ("inboxId") DO UPDATE SET
        "totalContacts" = "InboxContactStat"."totalContacts" + 1,
        "updatedAt" = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER conversation_insert_stats_trigger
    AFTER INSERT ON "Conversation"
    FOR EACH ROW
    EXECUTE FUNCTION increment_contact_stats();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION decrement_contact_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE "InboxContactStat"
    SET "totalContacts" = GREATEST("totalContacts" - 1, 0),
        "updatedAt" = CURRENT_TIMESTAMP
    WHERE "inboxId" = OLD."inboxId";

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER conversation_delete_stats_trigger
    AFTER DELETE ON "Conversation"
    FOR EACH ROW
    EXECUTE FUNCTION decrement_contact_stats();
--> statement-breakpoint
INSERT INTO "InboxContactStat" ("inboxId", "totalContacts", "updatedAt")
SELECT c."inboxId", COUNT(DISTINCT co."id")::integer, CURRENT_TIMESTAMP
FROM "Conversation" c
INNER JOIN "Contact" co ON co."id" = c."contactId"
GROUP BY c."inboxId"
ON CONFLICT ("inboxId") DO UPDATE SET
    "totalContacts" = EXCLUDED."totalContacts",
    "updatedAt" = CURRENT_TIMESTAMP;
