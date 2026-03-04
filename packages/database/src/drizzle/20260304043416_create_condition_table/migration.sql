CREATE TYPE "ConditionOwnerType" AS ENUM('trigger', 'webhook', 'broadcast');--> statement-breakpoint
CREATE TABLE "Condition" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"updatedAt" timestamp(3) DEFAULT now() NOT NULL,
	"ownerType" "ConditionOwnerType" NOT NULL,
	"ownerId" text NOT NULL,
	"type" integer NOT NULL,
	"sourceId" text,
	"operator" text,
	"value" jsonb
);
--> statement-breakpoint
CREATE INDEX "Condition_type_sourceId_idx" ON "Condition" ("type","sourceId" text_ops);--> statement-breakpoint
CREATE INDEX "Condition_ownerType_ownerId_idx" ON "Condition" ("ownerType" enum_ops,"ownerId" text_ops);--> statement-breakpoint
CREATE INDEX "Condition_type_sourceId_ownerType_ownerId_idx" ON "Condition" ("type","sourceId" text_ops,"ownerType" enum_ops,"ownerId" text_ops);