ALTER TABLE "Contact" ALTER COLUMN "emailOptIn" SET DEFAULT true;
UPDATE "Contact" SET "emailOptIn" = true;
ALTER TABLE "IntegrationSmtp" ADD COLUMN "fromAddress" text NOT NULL DEFAULT '';
UPDATE "IntegrationSmtp" SET "fromAddress" = auth->>'fromAddress' WHERE auth->>'fromAddress' IS NOT NULL;
