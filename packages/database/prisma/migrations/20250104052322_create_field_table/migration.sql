-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('ShortText', 'Number', 'Date', 'DateTime', 'Boolean', 'LongText');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('AccountField', 'CustomField');

-- AlterTable
ALTER TABLE "Folder" ALTER COLUMN "folderType" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "customFieldType" "CustomFieldType" NOT NULL,
    "description" TEXT,
    "folderId" TEXT,
    "fieldType" "FieldType" NOT NULL,
    "value" TEXT,
    "showInInbox" BOOLEAN NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
