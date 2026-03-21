ALTER TABLE "Plan" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "Plan" ADD COLUMN "price" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "Plan" ADD COLUMN "annualDiscountPrice" integer;--> statement-breakpoint
ALTER TABLE "Plan" ADD COLUMN "marketingFeatures" text[] DEFAULT '{}'::text[] NOT NULL;