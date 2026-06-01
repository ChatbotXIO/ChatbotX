ALTER TABLE "Contact" ALTER COLUMN "emailOptIn" SET DEFAULT true;
-- Existing contacts keep their current emailOptIn value (consent must not be assumed retroactively).
-- New contacts default to true.
ALTER TABLE "IntegrationSmtp" ADD COLUMN "fromAddress" text NOT NULL DEFAULT '';
UPDATE "IntegrationSmtp" SET "fromAddress" = auth->>'fromAddress' WHERE auth->>'fromAddress' IS NOT NULL;
