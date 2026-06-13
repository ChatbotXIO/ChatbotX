DROP INDEX IF EXISTS "User_email_key";--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "resellerId" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_platform_key" ON "User" ("email") WHERE "resellerId" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "User_email_reseller_key" ON "User" ("email","resellerId") WHERE "resellerId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "User_resellerId_idx" ON "User" ("resellerId");--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_resellerId_User_id_fkey" FOREIGN KEY ("resellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
