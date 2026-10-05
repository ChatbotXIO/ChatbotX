CREATE TYPE "DecisionConnectionStatus" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TYPE "DecisionConnectionTestStatus" AS ENUM('passed', 'failed');--> statement-breakpoint
CREATE TYPE "DecisionProviderKind" AS ENUM('typesafe', 'systemOneCompatible', 'openrouterDecision');--> statement-breakpoint
CREATE TYPE "DecisionProfileStatus" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TABLE "DecisionConnection" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"providerKind" "DecisionProviderKind" NOT NULL,
	"endpoint" text,
	"credential" jsonb NOT NULL,
	"modelCatalog" jsonb NOT NULL,
	"defaultModel" text,
	"status" "DecisionConnectionStatus" DEFAULT 'enabled'::"DecisionConnectionStatus" NOT NULL,
	"lastTestStatus" "DecisionConnectionTestStatus",
	"lastTestedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE TABLE "DecisionProfile" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "DecisionProfileStatus" DEFAULT 'enabled'::"DecisionProfileStatus" NOT NULL,
	"connectionId" bigint NOT NULL,
	"providerKind" "DecisionProviderKind" NOT NULL,
	"model" text NOT NULL,
	"contract" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "DecisionConnection_workspaceId_idx" ON "DecisionConnection" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "DecisionConnection_workspaceId_name_key" ON "DecisionConnection" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "DecisionProfile_workspaceId_idx" ON "DecisionProfile" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "DecisionProfile_workspaceId_name_key" ON "DecisionProfile" ("workspaceId","name");--> statement-breakpoint
ALTER TABLE "DecisionConnection" ADD CONSTRAINT "DecisionConnection_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DecisionProfile" ADD CONSTRAINT "DecisionProfile_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "DecisionProfile" ADD CONSTRAINT "DecisionProfile_connectionId_DecisionConnection_id_fkey" FOREIGN KEY ("connectionId") REFERENCES "DecisionConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
