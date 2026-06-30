CREATE TABLE "TenantHelpItem" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"tenantId" bigint NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "TenantHelpItem_tenantId_position_idx" ON "TenantHelpItem" ("tenantId","position");--> statement-breakpoint
ALTER TABLE "TenantHelpItem" ADD CONSTRAINT "TenantHelpItem_tenantId_Tenant_id_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;