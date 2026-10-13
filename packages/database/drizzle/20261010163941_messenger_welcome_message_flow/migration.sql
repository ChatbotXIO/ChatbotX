CREATE TABLE "MessengerWelcomeMessageFlow" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"flowId" bigint NOT NULL,
	"integrationMessengerId" bigint NOT NULL,
	"pageId" text NOT NULL,
	"metaFlowId" text NOT NULL,
	"flowVersionId" bigint,
	"status" text DEFAULT 'current' NOT NULL
);
--> statement-breakpoint
CREATE INDEX "MessengerWelcomeMessageFlow_workspaceId_flowId_idx" ON "MessengerWelcomeMessageFlow" ("workspaceId","flowId");--> statement-breakpoint
CREATE INDEX "MessengerWelcomeMessageFlow_integrationMessengerId_idx" ON "MessengerWelcomeMessageFlow" ("integrationMessengerId");--> statement-breakpoint
CREATE UNIQUE INDEX "MessengerWelcomeMessageFlow_current_key" ON "MessengerWelcomeMessageFlow" ("flowId","integrationMessengerId") WHERE "status" = 'current';--> statement-breakpoint
ALTER TABLE "MessengerWelcomeMessageFlow" ADD CONSTRAINT "MessengerWelcomeMessageFlow_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MessengerWelcomeMessageFlow" ADD CONSTRAINT "MessengerWelcomeMessageFlow_OSpsF41G77zr_fkey" FOREIGN KEY ("integrationMessengerId") REFERENCES "IntegrationMessenger"("id") ON DELETE CASCADE ON UPDATE CASCADE;