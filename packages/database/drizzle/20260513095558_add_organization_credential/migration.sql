CREATE TABLE "OrganizationCredential" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"organizationId" bigint NOT NULL,
	"type" text NOT NULL,
	"publicConfig" jsonb NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "OrganizationCredential_organizationId_type_key" ON "OrganizationCredential" ("organizationId","type");--> statement-breakpoint
CREATE INDEX "OrganizationCredential_organizationId_idx" ON "OrganizationCredential" ("organizationId");--> statement-breakpoint
ALTER TABLE "OrganizationCredential" ADD CONSTRAINT "OrganizationCredential_organizationId_Organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
