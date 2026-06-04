CREATE TABLE "IntegrationClaude" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"autoReply" boolean DEFAULT false NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"maxOutputTokens" integer NOT NULL,
	"model" text NOT NULL,
	"prompt" text,
	"temperature" double precision
);
--> statement-breakpoint
CREATE TABLE "IntegrationDeepseek" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"auth" jsonb NOT NULL,
	"autoReply" boolean DEFAULT false NOT NULL,
	"workspaceId" bigint NOT NULL,
	"integrationId" bigint NOT NULL,
	"maxOutputTokens" integer NOT NULL,
	"model" text NOT NULL,
	"prompt" text,
	"temperature" double precision
);
--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationClaude_workspaceId_key" ON "IntegrationClaude" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationClaude_integrationId_key" ON "IntegrationClaude" ("integrationId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationDeepseek_workspaceId_key" ON "IntegrationDeepseek" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "IntegrationDeepseek_integrationId_key" ON "IntegrationDeepseek" ("integrationId");--> statement-breakpoint
ALTER TABLE "IntegrationClaude" ADD CONSTRAINT "IntegrationClaude_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationClaude" ADD CONSTRAINT "IntegrationClaude_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationDeepseek" ADD CONSTRAINT "IntegrationDeepseek_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "IntegrationDeepseek" ADD CONSTRAINT "IntegrationDeepseek_integrationId_Integration_id_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;