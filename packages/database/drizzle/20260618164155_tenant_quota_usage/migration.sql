CREATE TABLE "TenantQuotaUsage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"tenantId" bigint NOT NULL UNIQUE,
	"contactsUsed" integer DEFAULT 0 NOT NULL,
	"workspacesUsed" integer DEFAULT 0 NOT NULL,
	"channelsUsed" integer DEFAULT 0 NOT NULL,
	"teamMembersUsed" integer DEFAULT 0 NOT NULL,
	"macUsed" integer DEFAULT 0 NOT NULL,
	"syncedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "TenantQuotaUsage" ADD CONSTRAINT "TenantQuotaUsage_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;