CREATE TABLE "Plan" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"priceId" text NOT NULL,
	"annualDiscountPrice" integer,
	"annualDiscountPriceId" text,
	"limits" jsonb NOT NULL,
	"freeTrial" jsonb,
	"currency" text NOT NULL,
	"marketingFeatures" text[] DEFAULT '{}'::text[] NOT NULL,
	"organizationId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Subscription" (
	"id" text PRIMARY KEY,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"plan" text NOT NULL,
	"referenceId" text NOT NULL,
	"stripeCustomerId" text,
	"stripeSubscriptionId" text,
	"status" text NOT NULL,
	"periodStart" timestamp(6) with time zone,
	"periodEnd" timestamp(6) with time zone,
	"cancelAtPeriodEnd" boolean,
	"cancelAt" timestamp(6) with time zone,
	"canceledAt" timestamp(6) with time zone,
	"endedAt" timestamp(6) with time zone,
	"seats" integer,
	"trialStart" timestamp(6) with time zone,
	"trialEnd" timestamp(6) with time zone,
	"billingInterval" text,
	"stripeScheduleId" text
);
--> statement-breakpoint
ALTER TABLE "Plan" ADD CONSTRAINT "BillingPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;