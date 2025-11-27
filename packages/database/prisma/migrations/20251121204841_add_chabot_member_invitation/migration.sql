/*
  Warnings:

  - You are about to drop the column `enableAnalytics` on the `ChatbotMember` table. All the data in the column will be lost.
  - You are about to drop the column `enableBroadcast` on the `ChatbotMember` table. All the data in the column will be lost.
  - You are about to drop the column `enableContacts` on the `ChatbotMember` table. All the data in the column will be lost.
  - You are about to drop the column `enableEcommerce` on the `ChatbotMember` table. All the data in the column will be lost.
  - You are about to drop the column `enableEmailAndPhone` on the `ChatbotMember` table. All the data in the column will be lost.
  - You are about to drop the column `enableFlows` on the `ChatbotMember` table. All the data in the column will be lost.
  - You are about to drop the column `enableOnlyAssignedContacts` on the `ChatbotMember` table. All the data in the column will be lost.
  - You are about to drop the column `isAdmin` on the `ChatbotMember` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ChatbotMember" DROP COLUMN "enableAnalytics",
DROP COLUMN "enableBroadcast",
DROP COLUMN "enableContacts",
DROP COLUMN "enableEcommerce",
DROP COLUMN "enableEmailAndPhone",
DROP COLUMN "enableFlows",
DROP COLUMN "enableOnlyAssignedContacts",
DROP COLUMN "isAdmin",
ADD COLUMN     "notificationChannels" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "notificationTypes" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "permissions" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chatbotId" TEXT,
    "invitedBy" TEXT NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_code_key" ON "Invitation"("code");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "OrganizationInvitation" DROP CONSTRAINT "OrganizationInvitation_inviterId_fkey";

-- DropForeignKey
ALTER TABLE "OrganizationInvitation" DROP CONSTRAINT "OrganizationInvitation_organizationId_fkey";

-- DropTable
DROP TABLE "OrganizationInvitation";

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedBy_fkey" FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
