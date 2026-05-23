ALTER TABLE "PlatformSetting" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "PlatformSetting" DROP COLUMN "primaryColor";--> statement-breakpoint
ALTER TABLE "PlatformSetting" DROP COLUMN "accentColor";--> statement-breakpoint
ALTER TABLE "PlatformSetting" DROP COLUMN "supportEmail";--> statement-breakpoint
ALTER TABLE "PlatformSetting" DROP COLUMN "supportUrl";--> statement-breakpoint
ALTER TABLE "PlatformSetting" DROP COLUMN "showPoweredBy";--> statement-breakpoint
ALTER TABLE "PlatformSetting" DROP COLUMN "jsEnabled";--> statement-breakpoint
ALTER TABLE "PlatformSetting" DROP COLUMN "cssVersion";--> statement-breakpoint
ALTER TABLE "PlatformSetting" DROP COLUMN "jsVersion";