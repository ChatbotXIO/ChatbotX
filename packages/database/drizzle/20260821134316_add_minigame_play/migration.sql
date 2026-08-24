CREATE TYPE "minigameType" AS ENUM('luckyWheel', 'jackpot', 'gashapon', 'drawLots', 'scratchOff');--> statement-breakpoint
CREATE TABLE "Minigame" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"name" text NOT NULL,
	"type" "minigameType" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"generalSettings" jsonb NOT NULL,
	"appearance" jsonb NOT NULL,
	"playerSettings" jsonb NOT NULL,
	"prizeSettings" jsonb NOT NULL,
	"winningMessageSettings" jsonb NOT NULL,
	"nonWinningMessageSettings" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MinigameContact" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"minigameId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"openedAt" timestamp(6) with time zone NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"remaining" integer DEFAULT 0 NOT NULL,
	"referrerContactId" bigint
);
--> statement-breakpoint
CREATE INDEX "Minigame_workspaceId_idx" ON "Minigame" ("workspaceId");--> statement-breakpoint
CREATE UNIQUE INDEX "Minigame_workspaceId_name_key" ON "Minigame" ("workspaceId","name");--> statement-breakpoint
CREATE INDEX "MinigameContact_minigameId_idx" ON "MinigameContact" ("minigameId");--> statement-breakpoint
CREATE INDEX "MinigameContact_contactId_idx" ON "MinigameContact" ("contactId");--> statement-breakpoint
CREATE UNIQUE INDEX "MinigameContact_minigameId_contactId_key" ON "MinigameContact" ("minigameId","contactId");--> statement-breakpoint
ALTER TABLE "Minigame" ADD CONSTRAINT "Minigame_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MinigameContact" ADD CONSTRAINT "MinigameContact_minigameId_Minigame_id_fkey" FOREIGN KEY ("minigameId") REFERENCES "Minigame"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MinigameContact" ADD CONSTRAINT "MinigameContact_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MinigameContact" ADD CONSTRAINT "MinigameContact_referrerContactId_Contact_id_fkey" FOREIGN KEY ("referrerContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MinigamePlay" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"minigameId" bigint NOT NULL,
	"contactId" bigint NOT NULL,
	"isWinning" boolean NOT NULL,
	"prizeId" text,
	"prizeName" text
);
--> statement-breakpoint
CREATE INDEX "MinigamePlay_minigameId_contactId_idx" ON "MinigamePlay" ("minigameId","contactId");--> statement-breakpoint
CREATE INDEX "MinigamePlay_contactId_idx" ON "MinigamePlay" ("contactId");--> statement-breakpoint
ALTER TABLE "MinigamePlay" ADD CONSTRAINT "MinigamePlay_minigameId_Minigame_id_fkey" FOREIGN KEY ("minigameId") REFERENCES "Minigame"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "MinigamePlay" ADD CONSTRAINT "MinigamePlay_contactId_Contact_id_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
