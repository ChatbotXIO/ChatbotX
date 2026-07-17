UPDATE "ContactOnSmartDelay" SET "status" = 'canceled'
WHERE "type" = 'followUp' AND "status" = 'pending'
  AND "id" NOT IN (
    SELECT DISTINCT ON ("workspaceId", "contactInboxId", "flowId", "stepId") "id"
    FROM "ContactOnSmartDelay"
    WHERE "type" = 'followUp' AND "status" = 'pending'
    ORDER BY "workspaceId", "contactInboxId", "flowId", "stepId", "createdAt" DESC
  );
--> statement-breakpoint
CREATE UNIQUE INDEX "ContactOnSmartDelay_followUp_active_key" ON "ContactOnSmartDelay" ("workspaceId","contactInboxId","flowId","stepId") WHERE "status" NOT IN ('completed', 'failed', 'canceled') AND "type" = 'followUp';
