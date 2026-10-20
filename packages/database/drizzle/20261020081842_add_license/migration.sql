CREATE TABLE "License" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"licenseId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "License_licenseId_key" ON "License" ("licenseId");