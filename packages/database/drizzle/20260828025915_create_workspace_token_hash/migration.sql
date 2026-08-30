ALTER TABLE "Workspace" ADD COLUMN "tokenHash" text;--> statement-breakpoint
CREATE INDEX "Workspace_tokenHash_idx" ON "Workspace" ("tokenHash");--> statement-breakpoint
UPDATE "Workspace" SET "tokenHash" = encode(sha256(convert_to("token",'UTF8')),'hex') WHERE "token" IS NOT NULL AND "tokenHash" IS NULL;--> statement-breakpoint
