CREATE TABLE "MobileRefreshToken" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"userId" bigint NOT NULL,
	"deviceId" text NOT NULL,
	"familyId" text NOT NULL,
	"tokenHash" text NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"rotatedAt" timestamp(6) with time zone,
	"revokedAt" timestamp(6) with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "MobileRefreshToken_tokenHash_key" ON "MobileRefreshToken" ("tokenHash");--> statement-breakpoint
CREATE INDEX "MobileRefreshToken_userId_idx" ON "MobileRefreshToken" ("userId");--> statement-breakpoint
CREATE INDEX "MobileRefreshToken_familyId_idx" ON "MobileRefreshToken" ("familyId");--> statement-breakpoint
ALTER TABLE "MobileRefreshToken" ADD CONSTRAINT "MobileRefreshToken_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;