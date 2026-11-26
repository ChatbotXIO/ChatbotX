SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TYPE "messageTranslationDirection" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "messageTranslationFailureCode" AS ENUM('integrationUnavailable', 'timeout', 'providerError', 'rateLimited', 'unsafeOutput');--> statement-breakpoint
CREATE TYPE "messageTranslationStatus" AS ENUM('translated', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "InboxTranslationSettings" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"enabledAt" timestamp(6) with time zone,
	"modelConfig" jsonb
);
--> statement-breakpoint
CREATE TABLE "MessageTranslation" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"messageId" bigint NOT NULL,
	"messageCreatedAt" timestamp(6) with time zone NOT NULL,
	"direction" "messageTranslationDirection" NOT NULL,
	"status" "messageTranslationStatus" NOT NULL,
	"sourceLanguage" text,
	"targetLanguage" text NOT NULL,
	"confidence" double precision,
	"displayText" text,
	"modelId" text,
	"failureCode" "messageTranslationFailureCode",
	"sourceHash" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "InboxTranslationSettings_workspaceId_key" ON "InboxTranslationSettings" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "MessageTranslation_workspaceId_messageId_key" ON "MessageTranslation" ("workspaceId","messageId");--> statement-breakpoint
CREATE INDEX "MessageTranslation_conversationId_idx" ON "MessageTranslation" ("conversationId");--> statement-breakpoint
ALTER TABLE "InboxTranslationSettings" ADD CONSTRAINT "InboxTranslationSettings_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MessageTranslation" ADD CONSTRAINT "MessageTranslation_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MessageTranslation" ADD CONSTRAINT "MessageTranslation_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;