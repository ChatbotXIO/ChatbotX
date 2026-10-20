CREATE TABLE "PlatformAdmin" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"userId" bigint NOT NULL,
	"role" text DEFAULT 'super-admin' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin" ("userId");--> statement-breakpoint
ALTER TABLE "PlatformAdmin" ADD CONSTRAINT "PlatformAdmin_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;