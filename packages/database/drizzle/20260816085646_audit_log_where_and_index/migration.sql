ALTER TABLE "AuditLog" ADD COLUMN "ipAddress" text;--> statement-breakpoint
ALTER TABLE "AuditLog" ADD COLUMN "userAgent" text;--> statement-breakpoint
ALTER TABLE "AuditLog" ADD COLUMN "source" text;--> statement-breakpoint
CREATE INDEX "AuditLog_workspaceId_createdAt_id_idx" ON "AuditLog" ("workspaceId","createdAt" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "AuditLog_workspaceId_userId_createdAt_id_idx" ON "AuditLog" ("workspaceId","userId","createdAt" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "userId" IS NOT NULL;