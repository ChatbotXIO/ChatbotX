-- Template tool categories (13 tools made selectable in templates). Forward-only: PostgreSQL cannot drop an enum value; a rolled-back app version ignores the extra values. Deploy workers before builder.
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'magicLinks' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'polls' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'dynamicImages' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'placeLocations' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'miniApps' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'minigames' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'leaderboards' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'openHours' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'vendors' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'discountCodes' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'storeSettings' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'storyAutomations' BEFORE 'customFields';--> statement-breakpoint
ALTER TYPE "templateResourceCategory" ADD VALUE IF NOT EXISTS 'inboundWebhooks' BEFORE 'customFields';
