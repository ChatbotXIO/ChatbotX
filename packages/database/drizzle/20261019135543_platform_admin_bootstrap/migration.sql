CREATE TABLE "PlatformAdminBootstrap" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"bootstrapKey" text DEFAULT 'platform-admin' NOT NULL,
	"email" text NOT NULL,
	"userId" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "PlatformAdminBootstrap_bootstrapKey_key" ON "PlatformAdminBootstrap" ("bootstrapKey");