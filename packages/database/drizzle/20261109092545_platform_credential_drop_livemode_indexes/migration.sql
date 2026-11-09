-- Drop never-used livemode=true rows first so the new unique indexes cannot fail on duplicates.
-- Backup beforehand: CREATE TABLE "_bak_platform_credential_livemode" AS SELECT * FROM "PlatformCredential" WHERE "livemode" = true;
DELETE FROM "PlatformCredential" WHERE "livemode" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "PlatformCredential_user_type_key" ON "PlatformCredential" ("userId","type") WHERE "userId" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "PlatformCredential_platform_type_key" ON "PlatformCredential" ("type") WHERE "userId" IS NULL;
