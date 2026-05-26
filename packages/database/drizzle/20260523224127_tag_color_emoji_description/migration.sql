-- Esta migration consolida 3 mudanças que tinham sido aplicadas no banco
-- via SQL direto (sem snapshot drizzle) durante iterações anteriores:
--   1. ContactEvent (activity log)
--   2. LifecycleStage + Contact.lifecycleStageId
--   3. Tag.color/emoji/description (suporte ao novo TagFormDialog)
--
-- Toda a migration é idempotente — usa IF NOT EXISTS pra CREATE TABLE/COLUMN/INDEX
-- e blocos DO pra constraints. Pode rodar em qualquer ambiente sem quebrar.

CREATE TABLE IF NOT EXISTS "ContactEvent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(3) DEFAULT now() NOT NULL,
	"contactId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"eventType" text NOT NULL,
	"meta" jsonb,
	"actorUserId" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "LifecycleStage" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"isLost" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "Contact" ADD COLUMN IF NOT EXISTS "lifecycleStageId" bigint;--> statement-breakpoint
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "color" varchar(7) DEFAULT '#6B7280' NOT NULL;--> statement-breakpoint
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "emoji" varchar(8);--> statement-breakpoint
ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContactEvent_contactId_createdAt_idx" ON "ContactEvent" ("contactId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ContactEvent_workspaceId_createdAt_idx" ON "ContactEvent" ("workspaceId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "LifecycleStage_workspaceId_key_key" ON "LifecycleStage" ("workspaceId","key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LifecycleStage_workspaceId_idx" ON "LifecycleStage" ("workspaceId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LifecycleStage_position_idx" ON "LifecycleStage" ("position");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "Contact" ADD CONSTRAINT "Contact_lifecycleStageId_LifecycleStage_id_fkey" FOREIGN KEY ("lifecycleStageId") REFERENCES "LifecycleStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ContactEvent" ADD CONSTRAINT "ContactEvent_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "ContactEvent" ADD CONSTRAINT "ContactEvent_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "LifecycleStage" ADD CONSTRAINT "LifecycleStage_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
