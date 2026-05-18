CREATE TYPE "aiConversationEmbeddingStatus" AS ENUM('pending', 'success', 'error', 'processing');--> statement-breakpoint
CREATE TYPE "aiConversationSourceStatus" AS ENUM('pending', 'processing', 'success', 'error');--> statement-breakpoint
CREATE TYPE "aiConversationSourceType" AS ENUM('document', 'image', 'url', 'web_search');--> statement-breakpoint
CREATE TABLE "AIConversationEmbedding" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"sourceId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"chunkIndex" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"status" "aiConversationEmbeddingStatus" DEFAULT 'pending'::"aiConversationEmbeddingStatus" NOT NULL,
	"errorMessage" text
);
--> statement-breakpoint
CREATE TABLE "AIConversationSource" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"messageId" bigint NOT NULL,
	"attachmentId" bigint,
	"sourceType" "aiConversationSourceType" NOT NULL,
	"status" "aiConversationSourceStatus" DEFAULT 'pending'::"aiConversationSourceStatus" NOT NULL,
	"sourceKey" text NOT NULL,
	"contentHash" text,
	"mimeType" text,
	"title" text,
	"metadata" jsonb,
	"summary" text,
	"errorMessage" text
);
--> statement-breakpoint
CREATE INDEX "AIConversationEmbedding_lookup_idx" ON "AIConversationEmbedding" ("workspaceId","conversationId","sourceId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "AIConversationEmbedding_sourceId_chunkIndex_key" ON "AIConversationEmbedding" ("sourceId","chunkIndex");--> statement-breakpoint
CREATE INDEX "AIConversationSource_lookup_idx" ON "AIConversationSource" ("workspaceId","conversationId","sourceType","status");--> statement-breakpoint
CREATE UNIQUE INDEX "AIConversationSource_workspaceId_sourceType_sourceKey_key" ON "AIConversationSource" ("workspaceId","sourceType","sourceKey");--> statement-breakpoint
CREATE INDEX "AIConversationSource_messageId_idx" ON "AIConversationSource" ("messageId");--> statement-breakpoint
ALTER TABLE "AIConversationEmbedding" ADD CONSTRAINT "AIConversationEmbedding_sourceId_AIConversationSource_id_fkey" FOREIGN KEY ("sourceId") REFERENCES "AIConversationSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIConversationEmbedding" ADD CONSTRAINT "AIConversationEmbedding_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIConversationEmbedding" ADD CONSTRAINT "AIConversationEmbedding_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIConversationSource" ADD CONSTRAINT "AIConversationSource_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIConversationSource" ADD CONSTRAINT "AIConversationSource_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIConversationSource" ADD CONSTRAINT "AIConversationSource_messageId_Message_id_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "AIConversationSource" ADD CONSTRAINT "AIConversationSource_attachmentId_Attachment_id_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;