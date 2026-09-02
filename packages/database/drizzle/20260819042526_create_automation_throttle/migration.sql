CREATE TYPE "automationThrottleType" AS ENUM ('defaultReply');
--> statement-breakpoint
CREATE TABLE "AutomationThrottle" (
  "workspaceId"     bigint NOT NULL,
  "contactInboxId"  bigint NOT NULL,
  "throttleType"    "automationThrottleType" NOT NULL,
  "subjectId"       bigint NOT NULL,
  "lastTriggeredAt" timestamp(6) with time zone NOT NULL DEFAULT now(),
  "claimId"         uuid NOT NULL,
  CONSTRAINT "AutomationThrottle_pkey"
    PRIMARY KEY ("workspaceId","contactInboxId","throttleType","subjectId"),
  CONSTRAINT "AutomationThrottle_workspace_fk"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutomationThrottle_contact_inbox_fk"
    FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE CASCADE ON UPDATE CASCADE
) PARTITION BY HASH ("workspaceId");
--> statement-breakpoint
DO $$ BEGIN
  FOR i IN 0..31 LOOP
    EXECUTE format(
      'CREATE TABLE "AutomationThrottle_p%s" PARTITION OF "AutomationThrottle"
       FOR VALUES WITH (MODULUS 32, REMAINDER %s)', i, i);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE INDEX "AutomationThrottle_lastTriggeredAt_idx" ON "AutomationThrottle" ("lastTriggeredAt");
