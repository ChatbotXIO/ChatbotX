ALTER TABLE "Minigame" ADD COLUMN "playsCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Minigame" ADD COLUMN "participantsCount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "Minigame" ADD COLUMN "winnersCount" integer DEFAULT 0 NOT NULL;
ALTER TABLE "MinigameContact" ADD COLUMN "contactInboxId" bigint;--> statement-breakpoint
ALTER TABLE "MinigameContact" ADD CONSTRAINT "MinigameContact_contactInboxId_ContactInbox_id_fkey" FOREIGN KEY ("contactInboxId") REFERENCES "ContactInbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
