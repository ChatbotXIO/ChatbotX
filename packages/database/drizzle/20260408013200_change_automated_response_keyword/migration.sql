ALTER TYPE "customFieldType" ADD VALUE 'email' BEFORE 'number';--> statement-breakpoint
ALTER TYPE "customFieldType" ADD VALUE 'phoneNumber' BEFORE 'number';--> statement-breakpoint
ALTER TABLE "AutomatedResponse" RENAME COLUMN "userMessages" TO "keywords";