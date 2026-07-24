CREATE TYPE "lastUserInputType" AS ENUM('text', 'location', 'refLink', 'image', 'video', 'audio', 'gif', 'file');--> statement-breakpoint
CREATE TYPE "MessageCleanupStatus" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "questionnaireQuestionType" AS ENUM('text', 'number', 'email', 'phone', 'multipleChoice', 'date', 'datetime', 'image', 'file', 'location', 'websiteLink');--> statement-breakpoint
CREATE TYPE "questionnaireSubmissionStatus" AS ENUM('inProgress', 'completed', 'cancelled', 'failed', 'timeout');--> statement-breakpoint
ALTER TYPE "ContactOnSmartDelayStatus" ADD VALUE 'scheduled' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "ContactOnSmartDelayStatus" ADD VALUE 'canceled';--> statement-breakpoint
ALTER TYPE "ContactOnSmartDelayType" ADD VALUE 'followUp';--> statement-breakpoint
CREATE TABLE "WorkspaceUsage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL UNIQUE,
	"contactsUsed" integer DEFAULT 0 NOT NULL,
	"channelsUsed" integer DEFAULT 0 NOT NULL,
	"teamMembersUsed" integer DEFAULT 0 NOT NULL,
	"botMessagesUsed" integer DEFAULT 0 NOT NULL,
	"syncedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MessageCleanup" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"contactInboxId" bigint NOT NULL,
	"inboxId" bigint NOT NULL,
	"sourceId" text NOT NULL,
	"conversationIds" jsonb NOT NULL,
	"sinceTime" timestamp(6) with time zone,
	"deletedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"status" "MessageCleanupStatus" DEFAULT 'pending'::"MessageCleanupStatus" NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"processedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "QuestionnaireAnswer" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"submissionId" bigint NOT NULL,
	"questionId" bigint NOT NULL,
	"questionIdSnapshot" text NOT NULL,
	"questionTitleSnapshot" text NOT NULL,
	"questionTypeSnapshot" text NOT NULL,
	"labelSnapshot" text NOT NULL,
	"value" jsonb,
	"pointsEarned" integer,
	"attemptCount" integer DEFAULT 1 NOT NULL,
	"answeredAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Questionnaire" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"enableScore" boolean DEFAULT false NOT NULL,
	"enableRetryMessages" boolean DEFAULT false NOT NULL,
	"enableCustomFieldMapping" boolean DEFAULT true NOT NULL,
	"deletedAt" timestamp(6) with time zone,
	"triggerFlowId" bigint,
	"workspaceId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "QuestionnaireQuestion" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"questionnaireId" bigint NOT NULL,
	"title" text NOT NULL,
	"type" "questionnaireQuestionType" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"image" jsonb,
	"orderNo" integer DEFAULT 0 NOT NULL,
	"point" integer DEFAULT 1 NOT NULL,
	"retryMessage" text,
	"customFieldId" bigint,
	"systemFieldKey" text,
	"config" jsonb,
	"deletedAt" timestamp(6) with time zone,
	CONSTRAINT "QuestionnaireQuestion_customFieldId_systemFieldKey_exclusive" CHECK (("customFieldId" IS NULL) OR ("systemFieldKey" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "QuestionnaireSubmission" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"questionnaireId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"conversationId" bigint,
	"status" "questionnaireSubmissionStatus" DEFAULT 'inProgress'::"questionnaireSubmissionStatus" NOT NULL,
	"totalPoints" integer,
	"currentQuestionId" bigint,
	"currentQuestionSentAt" timestamp(6) with time zone,
	"lastAnsweredMessageId" bigint,
	"startedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp(6) with time zone,
	"cancelledAt" timestamp(6) with time zone
);
--> statement-breakpoint
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_workspaceId_Workspace_id_fkey";--> statement-breakpoint
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_conversationId_Conversation_id_fkey";--> statement-breakpoint
ALTER TABLE "Message" DROP CONSTRAINT "Message_conversationId_Conversation_id_fkey";--> statement-breakpoint
ALTER TABLE "Message" DROP CONSTRAINT "Message_contactInboxId_ContactInbox_id_fkey";--> statement-breakpoint
ALTER TABLE "Message" DROP CONSTRAINT "Message_workspaceId_Workspace_id_fkey";--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "lastUserInput" text;--> statement-breakpoint
ALTER TABLE "ContactInbox" ADD COLUMN "lastUserInputType" "lastUserInputType";--> statement-breakpoint
ALTER TABLE "IntegrationInstagram" ADD COLUMN "userInfo" jsonb;--> statement-breakpoint
ALTER TABLE "IntegrationMessenger" ADD COLUMN "userInfo" jsonb;--> statement-breakpoint
CREATE INDEX "AIConversationEmbedding_conversationId_idx" ON "AIConversationEmbedding" ("conversationId");--> statement-breakpoint
CREATE INDEX "AIConversationSource_conversationId_idx" ON "AIConversationSource" ("conversationId");--> statement-breakpoint
CREATE INDEX "ContactNote_contactId_idx" ON "ContactNote" ("contactId");--> statement-breakpoint
CREATE INDEX "ContactOnSmartDelay_conversationId_idx" ON "ContactOnSmartDelay" ("conversationId");--> statement-breakpoint
CREATE UNIQUE INDEX "ContactOnSmartDelay_followUp_active_key" ON "ContactOnSmartDelay" ("workspaceId","contactInboxId","flowId","stepId") WHERE "status" NOT IN ('completed', 'failed', 'canceled') AND "type" = 'followUp';--> statement-breakpoint
CREATE INDEX "FBCommentAutomationReply_contactId_idx" ON "FBCommentAutomationReply" ("contactId");--> statement-breakpoint
CREATE INDEX "FlowRun_conversationId_idx" ON "FlowRun" ("conversationId");--> statement-breakpoint
CREATE UNIQUE INDEX "MessageCleanup_inboxId_sourceId_key" ON "MessageCleanup" ("inboxId","sourceId");--> statement-breakpoint
CREATE INDEX "MessageCleanup_status_createdAt_idx" ON "MessageCleanup" ("status","createdAt");--> statement-breakpoint
CREATE INDEX "MessageCleanup_workspaceId_idx" ON "MessageCleanup" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "QuestionnaireAnswer_submissionId_questionIdSnapshot_key" ON "QuestionnaireAnswer" ("submissionId","questionIdSnapshot");--> statement-breakpoint
CREATE INDEX "QuestionnaireAnswer_questionId_idx" ON "QuestionnaireAnswer" ("questionId");--> statement-breakpoint
CREATE INDEX "Questionnaire_workspaceId_idx" ON "Questionnaire" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Questionnaire_workspaceId_name_key" ON "Questionnaire" ("workspaceId","name") WHERE ("deletedAt" is null);--> statement-breakpoint
CREATE INDEX "QuestionnaireQuestion_questionnaireId_orderNo_idx" ON "QuestionnaireQuestion" ("questionnaireId","orderNo");--> statement-breakpoint
CREATE INDEX "QuestionnaireQuestion_customFieldId_idx" ON "QuestionnaireQuestion" ("customFieldId");--> statement-breakpoint
CREATE INDEX "QuestionnaireSubmission_workspaceId_idx" ON "QuestionnaireSubmission" ("workspaceId");--> statement-breakpoint
CREATE INDEX "QuestionnaireSubmission_questionnaireId_status_idx" ON "QuestionnaireSubmission" ("questionnaireId","status");--> statement-breakpoint
CREATE INDEX "QuestionnaireSubmission_questionnaireId_contactId_idx" ON "QuestionnaireSubmission" ("questionnaireId","contactId");--> statement-breakpoint
CREATE UNIQUE INDEX "QuestionnaireSubmission_workspaceId_contactId_active_key" ON "QuestionnaireSubmission" ("workspaceId","contactId") WHERE "status" = 'inProgress';--> statement-breakpoint
CREATE INDEX "SequenceDispatch_contactId_idx" ON "SequenceDispatch" ("contactId");--> statement-breakpoint
CREATE INDEX "TriggerExecution_contactId_idx" ON "TriggerExecution" ("contactId");--> statement-breakpoint
CREATE INDEX "WebhookExecution_contactId_idx" ON "WebhookExecution" ("contactId");--> statement-breakpoint
ALTER TABLE "WorkspaceUsage" ADD CONSTRAINT "WorkspaceUsage_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireAnswer" ADD CONSTRAINT "QuestionnaireAnswer_l8clOEM7NsPl_fkey" FOREIGN KEY ("submissionId") REFERENCES "QuestionnaireSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireAnswer" ADD CONSTRAINT "QuestionnaireAnswer_questionId_QuestionnaireQuestion_id_fkey" FOREIGN KEY ("questionId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Questionnaire" ADD CONSTRAINT "Questionnaire_triggerFlowId_Flow_id_fkey" FOREIGN KEY ("triggerFlowId") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Questionnaire" ADD CONSTRAINT "Questionnaire_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_questionnaireId_Questionnaire_id_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireQuestion" ADD CONSTRAINT "QuestionnaireQuestion_customFieldId_CustomField_id_fkey" FOREIGN KEY ("customFieldId") REFERENCES "CustomField"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireSubmission" ADD CONSTRAINT "QuestionnaireSubmission_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireSubmission" ADD CONSTRAINT "QuestionnaireSubmission_questionnaireId_Questionnaire_id_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireSubmission" ADD CONSTRAINT "QuestionnaireSubmission_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireSubmission" ADD CONSTRAINT "QuestionnaireSubmission_conversationId_Conversation_id_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "QuestionnaireSubmission" ADD CONSTRAINT "QuestionnaireSubmission_mha0bYFxcV7A_fkey" FOREIGN KEY ("currentQuestionId") REFERENCES "QuestionnaireQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;