CREATE INDEX "PipelineItemActivity_pipelineId_idx" ON "PipelineItemActivity" ("pipelineId");--> statement-breakpoint
CREATE INDEX "PipelineItemActivity_actorUserId_idx" ON "PipelineItemActivity" ("actorUserId") WHERE "actorUserId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineItemAssignee_workspaceMemberId_idx" ON "PipelineItemAssignee" ("workspaceMemberId") WHERE "workspaceMemberId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineItemAssignee_inboxTeamId_idx" ON "PipelineItemAssignee" ("inboxTeamId") WHERE "inboxTeamId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineItemComment_createdById_idx" ON "PipelineItemComment" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineItem_stageId_idx" ON "PipelineItem" ("stageId");--> statement-breakpoint
CREATE INDEX "PipelineItem_createdById_idx" ON "PipelineItem" ("createdById") WHERE "createdById" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "PipelineItem_closedById_idx" ON "PipelineItem" ("closedById") WHERE "closedById" IS NOT NULL;