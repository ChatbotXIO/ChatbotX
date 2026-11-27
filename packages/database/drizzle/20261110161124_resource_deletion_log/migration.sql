CREATE TYPE "resourceDeletionResourceType" AS ENUM('workspace', 'channel');--> statement-breakpoint
CREATE TYPE "resourceDeletionStatus" AS ENUM('pending', 'completed', 'canceled');--> statement-breakpoint
CREATE TABLE "ResourceDeletionLog" (
	"id" bigint PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"workspaceId" bigint NOT NULL,
	"resourceType" "resourceDeletionResourceType" NOT NULL,
	"resourceId" text NOT NULL,
	"resourceSubtype" text,
	"resourceName" text,
	"status" "resourceDeletionStatus" NOT NULL,
	"requestedByUserId" bigint,
	"requestSource" text,
	"ipAddress" text,
	"userAgent" text,
	"requestedAt" timestamp(6) with time zone NOT NULL,
	"completedAt" timestamp(6) with time zone,
	"canceledAt" timestamp(6) with time zone
);
