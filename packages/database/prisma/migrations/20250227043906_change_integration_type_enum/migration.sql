/*
  Warnings:

  - The values [GOOGLESHEETS] on the enum `IntegrationType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "IntegrationType_new" AS ENUM ('CHATWIDGET', 'GOOGLE_SHEETS', 'INSTAGRAM', 'MESSENGER', 'OPENAI', 'WHATSAPP');
ALTER TABLE "Integration" ALTER COLUMN "integrationType" TYPE "IntegrationType_new" USING ("integrationType"::text::"IntegrationType_new");
ALTER TYPE "IntegrationType" RENAME TO "IntegrationType_old";
ALTER TYPE "IntegrationType_new" RENAME TO "IntegrationType";
DROP TYPE "IntegrationType_old";
COMMIT;
