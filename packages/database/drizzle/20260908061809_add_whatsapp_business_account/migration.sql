CREATE TABLE "WhatsappBusinessAccount" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
	"wabaId" text NOT NULL,
	"businessId" text NOT NULL,
	"credential" jsonb NOT NULL,
	"grantedScopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"scopeCheckedAt" timestamp(6) with time zone,
	"provisionedAt" timestamp(6) with time zone,
	"creditLineId" text,
	"revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "WhatsappBusinessAccount_workspaceId_wabaId_key" ON "WhatsappBusinessAccount" ("workspaceId","wabaId");
