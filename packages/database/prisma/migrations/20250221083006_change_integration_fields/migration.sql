/*
  Warnings:

  - The values [User,Team] on the enum `AssignedType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Owner,Agent] on the enum `ChatbotMemberRole` will be removed. If these variants are still used in the database, this will fail.
  - The values [Free,Pro] on the enum `ChatbotPlan` will be removed. If these variants are still used in the database, this will fail.
  - The values [ShortText,Number,Date,DateTime,Boolean,LongText] on the enum `CustomFieldType` will be removed. If these variants are still used in the database, this will fail.
  - The values [AccountField,CustomField] on the enum `FieldType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Image,Audio,Video,File] on the enum `FileType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Tag,Flow,CustomField,EmailCampaign,AutomatedResponse] on the enum `FolderType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Male,Female,Unknown] on the enum `Gender` will be removed. If these variants are still used in the database, this will fail.
  - The values [ChatWidget,Instagram,Messenger,Whatsapp] on the enum `InboxType` will be removed. If these variants are still used in the database, this will fail.
  - The values [ChatWidget,GoogleSheets,Instagram,Messenger,OpenAI,Whatsapp] on the enum `IntegrationType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Audio,Card,Carousel,Choice,Dropdown,File,Image,Location,Markdown,System,Text,Video] on the enum `MessageType` will be removed. If these variants are still used in the database, this will fail.
  - The values [Bot,Contact,System,User] on the enum `SenderType` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `mimeType` to the `Attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `contentType` to the `Message` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('TEXT');

-- AlterEnum
BEGIN;
CREATE TYPE "AssignedType_new" AS ENUM ('USER', 'TEAM');
ALTER TABLE "Contact" ALTER COLUMN "assignedType" TYPE "AssignedType_new" USING ("assignedType"::text::"AssignedType_new");
ALTER TYPE "AssignedType" RENAME TO "AssignedType_old";
ALTER TYPE "AssignedType_new" RENAME TO "AssignedType";
DROP TYPE "AssignedType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ChatbotMemberRole_new" AS ENUM ('OWNER', 'AGENT');
ALTER TABLE "ChatbotMember" ALTER COLUMN "role" TYPE "ChatbotMemberRole_new" USING ("role"::text::"ChatbotMemberRole_new");
ALTER TYPE "ChatbotMemberRole" RENAME TO "ChatbotMemberRole_old";
ALTER TYPE "ChatbotMemberRole_new" RENAME TO "ChatbotMemberRole";
DROP TYPE "ChatbotMemberRole_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "ChatbotPlan_new" AS ENUM ('FREE', 'PRO');
ALTER TABLE "Chatbot" ALTER COLUMN "plan" TYPE "ChatbotPlan_new" USING ("plan"::text::"ChatbotPlan_new");
ALTER TYPE "ChatbotPlan" RENAME TO "ChatbotPlan_old";
ALTER TYPE "ChatbotPlan_new" RENAME TO "ChatbotPlan";
DROP TYPE "ChatbotPlan_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "CustomFieldType_new" AS ENUM ('SHORT_TEXT', 'NUMBER', 'DATE', 'DATETIME', 'BOOLEAN', 'LONG_TEXT');
ALTER TABLE "Field" ALTER COLUMN "customFieldType" TYPE "CustomFieldType_new" USING ("customFieldType"::text::"CustomFieldType_new");
ALTER TYPE "CustomFieldType" RENAME TO "CustomFieldType_old";
ALTER TYPE "CustomFieldType_new" RENAME TO "CustomFieldType";
DROP TYPE "CustomFieldType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "FieldType_new" AS ENUM ('ACCOUNT_FIELD', 'CUSTOM_FIELD');
ALTER TABLE "Field" ALTER COLUMN "fieldType" TYPE "FieldType_new" USING ("fieldType"::text::"FieldType_new");
ALTER TYPE "FieldType" RENAME TO "FieldType_old";
ALTER TYPE "FieldType_new" RENAME TO "FieldType";
DROP TYPE "FieldType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "FileType_new" AS ENUM ('IMAGE', 'AUDIO', 'VIDEO', 'FILE');
ALTER TABLE "Attachment" ALTER COLUMN "fileType" TYPE "FileType_new" USING ("fileType"::text::"FileType_new");
ALTER TYPE "FileType" RENAME TO "FileType_old";
ALTER TYPE "FileType_new" RENAME TO "FileType";
DROP TYPE "FileType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "FolderType_new" AS ENUM ('TAG', 'FLOW', 'CUSTOM_FIELD', 'EMAIL_CAMPAIGN', 'AUTOMATED_RESPONSE');
ALTER TABLE "Folder" ALTER COLUMN "folderType" TYPE "FolderType_new" USING ("folderType"::text::"FolderType_new");
ALTER TYPE "FolderType" RENAME TO "FolderType_old";
ALTER TYPE "FolderType_new" RENAME TO "FolderType";
DROP TYPE "FolderType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Gender_new" AS ENUM ('MALE', 'FEMALE', 'UNKNOWN');
ALTER TABLE "Contact" ALTER COLUMN "gender" TYPE "Gender_new" USING ("gender"::text::"Gender_new");
ALTER TYPE "Gender" RENAME TO "Gender_old";
ALTER TYPE "Gender_new" RENAME TO "Gender";
DROP TYPE "Gender_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "InboxType_new" AS ENUM ('CHATWIDGET', 'INSTAGRAM', 'MESSENGER', 'WHATSAPP');
ALTER TABLE "Inbox" ALTER COLUMN "inboxType" TYPE "InboxType_new" USING ("inboxType"::text::"InboxType_new");
ALTER TABLE "Conversation" ALTER COLUMN "inboxType" TYPE "InboxType_new" USING ("inboxType"::text::"InboxType_new");
ALTER TYPE "InboxType" RENAME TO "InboxType_old";
ALTER TYPE "InboxType_new" RENAME TO "InboxType";
DROP TYPE "InboxType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "IntegrationType_new" AS ENUM ('CHATWIDGET', 'GOOGLESHEETS', 'INSTAGRAM', 'MESSENGER', 'OPENAI', 'WHATSAPP');
ALTER TABLE "Integration" ALTER COLUMN "integrationType" TYPE "IntegrationType_new" USING ("integrationType"::text::"IntegrationType_new");
ALTER TYPE "IntegrationType" RENAME TO "IntegrationType_old";
ALTER TYPE "IntegrationType_new" RENAME TO "IntegrationType";
DROP TYPE "IntegrationType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "MessageType_new" AS ENUM ('INCOMING', 'OUTGOING', 'ACTIVITY');
ALTER TABLE "Message" ALTER COLUMN "messageType" TYPE "MessageType_new" USING ("messageType"::text::"MessageType_new");
ALTER TYPE "MessageType" RENAME TO "MessageType_old";
ALTER TYPE "MessageType_new" RENAME TO "MessageType";
DROP TYPE "MessageType_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SenderType_new" AS ENUM ('BOT', 'CONTACT', 'SYSTEM', 'USER');
ALTER TABLE "Message" ALTER COLUMN "senderType" TYPE "SenderType_new" USING ("senderType"::text::"SenderType_new");
ALTER TYPE "SenderType" RENAME TO "SenderType_old";
ALTER TYPE "SenderType_new" RENAME TO "SenderType";
DROP TYPE "SenderType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "mimeType" TEXT NOT NULL,
ADD COLUMN     "sourceId" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "conversationAttributes" JSONB,
ADD COLUMN     "sourceId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "contentAttributes" JSONB,
ADD COLUMN     "contentType" "ContentType" NOT NULL,
ADD COLUMN     "sourceId" TEXT;

-- CreateIndex
CREATE INDEX "Message_sourceId_idx" ON "Message"("sourceId");
