CREATE TYPE "questionnaireQuestionType" AS ENUM('text', 'number', 'email', 'phone', 'multipleChoice', 'date', 'datetime', 'image', 'file', 'location', 'websiteLink');--> statement-breakpoint
CREATE TYPE "questionnaireSubmissionStatus" AS ENUM('inProgress', 'completed', 'cancelled', 'failed', 'timeout');--> statement-breakpoint
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
	"startedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp(6) with time zone,
	"cancelledAt" timestamp(6) with time zone
);
--> statement-breakpoint
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