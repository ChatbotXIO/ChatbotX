CREATE TABLE "OAuthAccessToken" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"accessToken" text NOT NULL,
	"refreshToken" text NOT NULL,
	"accessTokenExpiresAt" timestamp(6) with time zone NOT NULL,
	"refreshTokenExpiresAt" timestamp(6) with time zone NOT NULL,
	"clientId" text NOT NULL,
	"userId" bigint,
	"scopes" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "OAuthApplication" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"metadata" text,
	"clientId" text NOT NULL,
	"clientSecret" text,
	"redirectUrls" text NOT NULL,
	"type" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"userId" bigint
);
--> statement-breakpoint
CREATE TABLE "OAuthConsent" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"clientId" text NOT NULL,
	"userId" bigint NOT NULL,
	"scopes" text NOT NULL,
	"consentGiven" boolean NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "OAuthAccessToken_accessToken_key" ON "OAuthAccessToken" ("accessToken");--> statement-breakpoint
CREATE UNIQUE INDEX "OAuthAccessToken_refreshToken_key" ON "OAuthAccessToken" ("refreshToken");--> statement-breakpoint
CREATE INDEX "OAuthAccessToken_clientId_idx" ON "OAuthAccessToken" ("clientId");--> statement-breakpoint
CREATE INDEX "OAuthAccessToken_userId_idx" ON "OAuthAccessToken" ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "OAuthApplication_clientId_key" ON "OAuthApplication" ("clientId");--> statement-breakpoint
CREATE INDEX "OAuthApplication_userId_idx" ON "OAuthApplication" ("userId");--> statement-breakpoint
CREATE INDEX "OAuthConsent_clientId_idx" ON "OAuthConsent" ("clientId");--> statement-breakpoint
CREATE INDEX "OAuthConsent_userId_idx" ON "OAuthConsent" ("userId");--> statement-breakpoint
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_clientId_OAuthApplication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthApplication"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthAccessToken" ADD CONSTRAINT "OAuthAccessToken_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthApplication" ADD CONSTRAINT "OAuthApplication_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthConsent" ADD CONSTRAINT "OAuthConsent_clientId_OAuthApplication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthApplication"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "OAuthConsent" ADD CONSTRAINT "OAuthConsent_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;