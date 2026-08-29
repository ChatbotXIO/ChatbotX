CREATE TYPE "devicePlatform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "UserDeviceToken" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"userId" bigint NOT NULL,
	"workspaceId" bigint,
	"platform" "devicePlatform" NOT NULL,
	"token" text NOT NULL CONSTRAINT "UserDeviceToken_token_key" UNIQUE,
	"lastSeenAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "UserDeviceToken_userId_idx" ON "UserDeviceToken" ("userId");--> statement-breakpoint
ALTER TABLE "UserDeviceToken" ADD CONSTRAINT "UserDeviceToken_userId_User_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint
ALTER TABLE "UserDeviceToken" ADD CONSTRAINT "UserDeviceToken_workspaceId_Workspace_id_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;