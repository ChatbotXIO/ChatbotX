-- Replaces the five earlier pipeline migrations of this branch. A database that
-- already ran them holds these objects, so they are dropped first; where they
-- never existed (production) every drop is a no-op.
DROP TABLE IF EXISTS "PipelineItemActivity" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "PipelineItemAttachment" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "PipelineItemComment" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "PipelineItemAssignee" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "PipelineItem" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "PipelineItemCounter" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "PipelineMember" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "PipelineField" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "PipelineStage" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "Pipeline" CASCADE;--> statement-breakpoint
DROP TYPE IF EXISTS "pipelineActivityKind";--> statement-breakpoint
DROP TYPE IF EXISTS "pipelineActorKind";--> statement-breakpoint
DROP TYPE IF EXISTS "pipelineItemPriority";--> statement-breakpoint
DROP TYPE IF EXISTS "pipelineItemStatus";--> statement-breakpoint
DROP TYPE IF EXISTS "pipelineType";--> statement-breakpoint
CREATE TYPE "pipelineActivityKind" AS ENUM('created', 'stageChanged', 'statusChanged', 'valueChanged', 'priorityChanged', 'dueDateChanged', 'titleChanged', 'descriptionChanged', 'fieldValuesChanged', 'assigneesChanged', 'attachmentAdded', 'attachmentRemoved', 'commentAdded', 'commentDeleted', 'transferred', 'deleted');--> statement-breakpoint
CREATE TYPE "pipelineActorKind" AS ENUM('user', 'workspaceToken', 'flow', 'trigger', 'system');--> statement-breakpoint
CREATE TYPE "pipelineItemPriority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "pipelineItemStatus" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "pipelineType" AS ENUM('opportunity', 'ticket', 'custom');--> statement-breakpoint
CREATE TABLE "PipelineField" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"pipelineId" bigint NOT NULL,
	"name" text NOT NULL,
	"referenceName" text NOT NULL,
	"type" "customFieldType" NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PipelineItemActivity" (
	"id" bigint,
	"workspaceId" bigint,
	"pipelineId" bigint NOT NULL,
	"itemId" bigint NOT NULL,
	"itemNumber" bigint NOT NULL,
	"itemTitle" text NOT NULL,
	"contactId" bigint NOT NULL,
	"kind" "pipelineActivityKind" NOT NULL,
	"actorKind" "pipelineActorKind" NOT NULL,
	"actorUserId" bigint,
	"actorSourceId" text,
	"fromStageId" bigint,
	"toStageId" bigint,
	"fromStatus" "pipelineItemStatus",
	"toStatus" "pipelineItemStatus",
	"fromValue" numeric(19,4),
	"toValue" numeric(19,4),
	"fromPriority" "pipelineItemPriority",
	"toPriority" "pipelineItemPriority",
	"fromDueDate" timestamp(6) with time zone,
	"toDueDate" timestamp(6) with time zone,
	"fromTitle" text,
	"toTitle" text,
	"fromPipelineId" bigint,
	"version" integer DEFAULT 1 NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "PipelineItemActivity_pkey" PRIMARY KEY("id","workspaceId")
) PARTITION BY HASH ("workspaceId");
--> statement-breakpoint
DO $$
BEGIN
  FOR i IN 0..31 LOOP
    EXECUTE format(
      'CREATE TABLE "PipelineItemActivity_p%s" PARTITION OF "PipelineItemActivity" FOR VALUES WITH (MODULUS 32, REMAINDER %s)',
      i,
      i
    );
  END LOOP;
END $$;
--> statement-breakpoint
CREATE TABLE "PipelineItemAssignee" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"itemId" bigint NOT NULL,
	"workspaceMemberId" bigint,
	"inboxTeamId" bigint,
	CONSTRAINT "PipelineItemAssignee_one_target_check" CHECK (("workspaceMemberId" IS NULL) <> ("inboxTeamId" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "PipelineItemAttachment" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"itemId" bigint NOT NULL,
	"mediaLibraryFileId" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PipelineItemComment" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"itemId" bigint NOT NULL,
	"text" text NOT NULL,
	"createdById" bigint,
	"idempotencyKey" text
);
--> statement-breakpoint
CREATE TABLE "PipelineItemCounter" (
	"workspaceId" bigint PRIMARY KEY,
	"lastNumber" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PipelineItem" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"pipelineId" bigint NOT NULL,
	"stageId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"number" bigint NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"value" numeric(19,4),
	"status" "pipelineItemStatus" NOT NULL,
	"priority" "pipelineItemPriority" NOT NULL,
	"dueDate" timestamp(6) with time zone,
	"fieldValues" jsonb NOT NULL,
	"createdById" bigint,
	"closedById" bigint,
	"stageEnteredAt" timestamp(6) with time zone NOT NULL,
	"statusChangedAt" timestamp(6) with time zone,
	"closedAt" timestamp(6) with time zone,
	"lastCommentAt" timestamp(6) with time zone,
	"idempotencyKey" text
);
--> statement-breakpoint
CREATE TABLE "PipelineMember" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"pipelineId" bigint NOT NULL,
	"workspaceMemberId" bigint NOT NULL,
	"canManageSettings" boolean DEFAULT false NOT NULL,
	"canView" boolean DEFAULT true NOT NULL,
	"canEdit" boolean DEFAULT false NOT NULL,
	"canDelete" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Pipeline" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"type" "pipelineType" NOT NULL,
	"referenceName" text NOT NULL,
	"currency" text NOT NULL,
	"settings" jsonb NOT NULL,
	"createdById" bigint
);
--> statement-breakpoint
CREATE TABLE "PipelineStage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"pipelineId" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"textColor" text,
	"backgroundColor" text,
	"position" integer NOT NULL,
	"bulkJobId" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "PipelineField_pipelineId_referenceName_key" ON "PipelineField" ("pipelineId","referenceName");--> statement-breakpoint
CREATE INDEX "PipelineField_workspaceId_idx" ON "PipelineField" ("workspaceId");--> statement-breakpoint
CREATE INDEX "PipelineItemActivity_pipeline_kind_occurredAt_idx" ON "PipelineItemActivity" ("workspaceId","pipelineId","kind","occurredAt");--> statement-breakpoint
CREATE INDEX "PipelineItemActivity_item_occurredAt_idx" ON "PipelineItemActivity" ("workspaceId","itemId","occurredAt" DESC);--> statement-breakpoint
CREATE INDEX "PipelineItemActivity_contact_idx" ON "PipelineItemActivity" ("workspaceId","contactId");--> statement-breakpoint
CREATE INDEX "PipelineItemActivity_pipelineId_idx" ON "PipelineItemActivity" ("pipelineId");--> statement-breakpoint
CREATE INDEX "PipelineItemActivity_actorUserId_idx" ON "PipelineItemActivity" ("actorUserId") WHERE "actorUserId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "PipelineItemAssignee_item_member_key" ON "PipelineItemAssignee" ("itemId","workspaceMemberId");--> statement-breakpoint
CREATE UNIQUE INDEX "PipelineItemAssignee_item_team_key" ON "PipelineItemAssignee" ("itemId","inboxTeamId");--> statement-breakpoint
CREATE INDEX "PipelineItemAssignee_member_idx" ON "PipelineItemAssignee" ("workspaceId","workspaceMemberId");--> statement-breakpoint
CREATE INDEX "PipelineItemAssignee_team_idx" ON "PipelineItemAssignee" ("workspaceId","inboxTeamId");--> statement-breakpoint
CREATE INDEX "PipelineItemAssignee_workspaceMemberId_idx" ON "PipelineItemAssignee" ("workspaceMemberId") WHERE "workspaceMemberId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineItemAssignee_inboxTeamId_idx" ON "PipelineItemAssignee" ("inboxTeamId") WHERE "inboxTeamId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "PipelineItemAttachment_item_file_key" ON "PipelineItemAttachment" ("itemId","mediaLibraryFileId");--> statement-breakpoint
CREATE INDEX "PipelineItemAttachment_mediaLibraryFileId_idx" ON "PipelineItemAttachment" ("mediaLibraryFileId");--> statement-breakpoint
CREATE INDEX "PipelineItemAttachment_workspaceId_idx" ON "PipelineItemAttachment" ("workspaceId");--> statement-breakpoint
CREATE INDEX "PipelineItemComment_item_createdAt_idx" ON "PipelineItemComment" ("itemId","createdAt" DESC);--> statement-breakpoint
CREATE INDEX "PipelineItemComment_createdById_idx" ON "PipelineItemComment" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "PipelineItemComment_item_idempotencyKey_key" ON "PipelineItemComment" ("workspaceId","itemId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "PipelineItem_workspaceId_number_key" ON "PipelineItem" ("workspaceId","number");--> statement-breakpoint
CREATE UNIQUE INDEX "PipelineItem_pipeline_idempotencyKey_key" ON "PipelineItem" ("workspaceId","pipelineId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineItem_contact_status_idx" ON "PipelineItem" ("workspaceId","pipelineId","contactId","status","createdAt" DESC);--> statement-breakpoint
CREATE INDEX "PipelineItem_stage_createdAt_idx" ON "PipelineItem" ("pipelineId","stageId","createdAt" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX "PipelineItem_pipeline_createdAt_idx" ON "PipelineItem" ("pipelineId","createdAt" DESC,"id" DESC);--> statement-breakpoint
CREATE INDEX "PipelineItem_pipeline_id_idx" ON "PipelineItem" ("pipelineId","id");--> statement-breakpoint
CREATE INDEX "PipelineItem_contactId_idx" ON "PipelineItem" ("contactId");--> statement-breakpoint
CREATE INDEX "PipelineItem_stageId_idx" ON "PipelineItem" ("stageId");--> statement-breakpoint
CREATE INDEX "PipelineItem_createdById_idx" ON "PipelineItem" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineItem_closedById_idx" ON "PipelineItem" ("closedById") WHERE "closedById" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "PipelineMember_pipeline_member_key" ON "PipelineMember" ("pipelineId","workspaceMemberId");--> statement-breakpoint
CREATE INDEX "PipelineMember_member_idx" ON "PipelineMember" ("workspaceId","workspaceMemberId");--> statement-breakpoint
CREATE INDEX "PipelineMember_workspaceMemberId_idx" ON "PipelineMember" ("workspaceMemberId");--> statement-breakpoint
CREATE UNIQUE INDEX "Pipeline_workspaceId_referenceName_key" ON "Pipeline" ("workspaceId","referenceName");--> statement-breakpoint
CREATE UNIQUE INDEX "Pipeline_workspaceId_name_key" ON "Pipeline" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "Pipeline_createdById_idx" ON "Pipeline" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineStage_pipelineId_position_idx" ON "PipelineStage" ("pipelineId","position");--> statement-breakpoint
CREATE INDEX "PipelineStage_workspaceId_idx" ON "PipelineStage" ("workspaceId");--> statement-breakpoint
ALTER TABLE "PipelineField" ADD CONSTRAINT "PipelineField_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineField" ADD CONSTRAINT "PipelineField_pipelineId_Pipeline_id_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemActivity" ADD CONSTRAINT "PipelineItemActivity_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemActivity" ADD CONSTRAINT "PipelineItemActivity_pipelineId_Pipeline_id_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemActivity" ADD CONSTRAINT "PipelineItemActivity_actorUserId_User_id_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemAssignee" ADD CONSTRAINT "PipelineItemAssignee_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemAssignee" ADD CONSTRAINT "PipelineItemAssignee_itemId_PipelineItem_id_fkey" FOREIGN KEY ("itemId") REFERENCES "PipelineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemAssignee" ADD CONSTRAINT "PipelineItemAssignee_workspaceMemberId_WorkspaceMember_id_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemAssignee" ADD CONSTRAINT "PipelineItemAssignee_inboxTeamId_InboxTeam_id_fkey" FOREIGN KEY ("inboxTeamId") REFERENCES "InboxTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemAttachment" ADD CONSTRAINT "PipelineItemAttachment_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemAttachment" ADD CONSTRAINT "PipelineItemAttachment_itemId_PipelineItem_id_fkey" FOREIGN KEY ("itemId") REFERENCES "PipelineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemAttachment" ADD CONSTRAINT "PipelineItemAttachment_BBiTPytjYFfD_fkey" FOREIGN KEY ("mediaLibraryFileId") REFERENCES "MediaLibraryFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemComment" ADD CONSTRAINT "PipelineItemComment_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemComment" ADD CONSTRAINT "PipelineItemComment_itemId_PipelineItem_id_fkey" FOREIGN KEY ("itemId") REFERENCES "PipelineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemComment" ADD CONSTRAINT "PipelineItemComment_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItemCounter" ADD CONSTRAINT "PipelineItemCounter_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_pipelineId_Pipeline_id_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_stageId_PipelineStage_id_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineItem" ADD CONSTRAINT "PipelineItem_closedById_User_id_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineMember" ADD CONSTRAINT "PipelineMember_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineMember" ADD CONSTRAINT "PipelineMember_pipelineId_Pipeline_id_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineMember" ADD CONSTRAINT "PipelineMember_workspaceMemberId_WorkspaceMember_id_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Pipeline" ADD CONSTRAINT "Pipeline_createdById_User_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_pipelineId_Pipeline_id_fkey" FOREIGN KEY ("pipelineId") REFERENCES "Pipeline"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
-- The dormant ticket* trigger events became pipelineItem* events. The condition
-- schema never accepted the old values, so no row should exist; this keeps any
-- stray one working instead of leaving it on a type nothing emits.
UPDATE "Condition" SET "type" = CASE "type"
  WHEN 'ticketCreated' THEN 'pipelineItemCreated'
  WHEN 'ticketMovedToStage' THEN 'pipelineItemMovedToStage'
  WHEN 'ticketValueChanged' THEN 'pipelineItemValueChanged'
  WHEN 'ticketStatusChanged' THEN 'pipelineItemStatusChanged'
  WHEN 'ticketPriorityChanged' THEN 'pipelineItemPriorityChanged'
END
WHERE "type" IN (
  'ticketCreated',
  'ticketMovedToStage',
  'ticketValueChanged',
  'ticketStatusChanged',
  'ticketPriorityChanged'
);
