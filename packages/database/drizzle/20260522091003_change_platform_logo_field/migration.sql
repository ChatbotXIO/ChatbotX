ALTER TABLE "PlatformSetting" RENAME COLUMN "logoLightUrl" TO "logoLightPath";--> statement-breakpoint
ALTER TABLE "PlatformSetting" RENAME COLUMN "logoDarkUrl" TO "logoDarkPath";--> statement-breakpoint
ALTER TABLE "PlatformSetting" RENAME COLUMN "faviconUrl" TO "faviconPath";
ALTER TABLE "PlatformSetting" ADD COLUMN "policyUrl" text;--> statement-breakpoint
ALTER TABLE "PlatformSetting" ADD COLUMN "termsOfServiceUrl" text;
