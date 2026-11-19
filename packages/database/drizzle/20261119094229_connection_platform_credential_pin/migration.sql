ALTER TABLE "ConnectSession" ADD COLUMN "platformCredentialId" bigint;--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD COLUMN "platformClientId" text;--> statement-breakpoint
ALTER TABLE "Connection" ADD COLUMN "platformCredentialId" bigint;--> statement-breakpoint
CREATE INDEX "ConnectSession_platformCredentialId_idx" ON "ConnectSession" ("platformCredentialId") WHERE "platformCredentialId" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "Connection_platformCredentialId_idx" ON "Connection" ("platformCredentialId") WHERE "platformCredentialId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ConnectSession" ADD CONSTRAINT "ConnectSession_platformCredentialId_PlatformCredential_id_fkey" FOREIGN KEY ("platformCredentialId") REFERENCES "PlatformCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_platformCredentialId_PlatformCredential_id_fkey" FOREIGN KEY ("platformCredentialId") REFERENCES "PlatformCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;