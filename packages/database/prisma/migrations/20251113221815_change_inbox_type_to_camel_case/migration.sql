/*
  Warnings:

  - The values [Webchat,Messenger,Whatsapp,Zalo] on the enum `InboxType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Webchat,GoogleSheets,Messenger,OpenAI,Gemini,Whatsapp,Zalo] on the enum `IntegrationType` will be removed. If these variants are still used in the database, this will fail.

*/
-- Change inboxType
ALTER TABLE "Inbox" ALTER COLUMN "inboxType" TYPE text USING ("inboxType"::"InboxType"::text);
UPDATE "Inbox" SET "inboxType" = 'webchat' WHERE "inboxType" = 'Webchat';
UPDATE "Inbox" SET "inboxType" = 'messenger' WHERE "inboxType" = 'Messenger';
UPDATE "Inbox" SET "inboxType" = 'whatsapp' WHERE "inboxType" = 'Whatsapp';
UPDATE "Inbox" SET "inboxType" = 'zalo' WHERE "inboxType" = 'Zalo';

ALTER TABLE "Broadcast" ALTER COLUMN "inboxType" TYPE text USING ("inboxType"::"InboxType"::text);
UPDATE "Broadcast" SET "inboxType" = 'webchat' WHERE "inboxType" = 'Webchat';
UPDATE "Broadcast" SET "inboxType" = 'messenger' WHERE "inboxType" = 'Messenger';
UPDATE "Broadcast" SET "inboxType" = 'whatsapp' WHERE "inboxType" = 'Whatsapp';
UPDATE "Broadcast" SET "inboxType" = 'zalo' WHERE "inboxType" = 'Zalo';

CREATE TYPE "InboxType_new" AS ENUM ('webchat', 'messenger', 'whatsapp', 'zalo');
ALTER TYPE "InboxType" RENAME TO "InboxType_old";
ALTER TYPE "InboxType_new" RENAME TO "InboxType";
DROP TYPE "public"."InboxType_old";
ALTER TABLE "Inbox" ALTER COLUMN "inboxType" TYPE "InboxType" USING ("inboxType"::text::"InboxType");

-- Change integrationType

ALTER TABLE "Integration" ALTER COLUMN "integrationType" TYPE text USING ("integrationType"::"IntegrationType"::text);
UPDATE "Integration" SET "integrationType" = 'webchat' WHERE "integrationType" = 'Webchat';
UPDATE "Integration" SET "integrationType" = 'googleSheets' WHERE "integrationType" = 'GoogleSheets';
UPDATE "Integration" SET "integrationType" = 'messenger' WHERE "integrationType" = 'Messenger';
UPDATE "Integration" SET "integrationType" = 'openai' WHERE "integrationType" = 'OpenAI';
UPDATE "Integration" SET "integrationType" = 'gemini' WHERE "integrationType" = 'Gemini';
UPDATE "Integration" SET "integrationType" = 'whatsapp' WHERE "integrationType" = 'Whatsapp';
UPDATE "Integration" SET "integrationType" = 'zalo' WHERE "integrationType" = 'Zalo';

CREATE TYPE "IntegrationType_new" AS ENUM ('webchat', 'googleSheets', 'messenger', 'openai', 'gemini', 'whatsapp', 'zalo');
ALTER TYPE "IntegrationType" RENAME TO "IntegrationType_old";
ALTER TYPE "IntegrationType_new" RENAME TO "IntegrationType";
DROP TYPE "public"."IntegrationType_old";
ALTER TABLE "Integration" ALTER COLUMN "integrationType" TYPE "IntegrationType" USING ("integrationType"::text::"IntegrationType");
