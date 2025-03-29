-- CreateEnum
CREATE TYPE "WhatsappTemplateCategory" AS ENUM ('AUTHENTICATION', 'MARKETING', 'UTILITY');

-- CreateEnum
CREATE TYPE "WhatsappTemplateStatus" AS ENUM ('APPROVED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "WhatsappFlowStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED', 'BLOCKED', 'THROTTLED');

-- CreateTable
CREATE TABLE "WhatsappMessageTemplate" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "integrationWhatsappId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" "WhatsappTemplateCategory" NOT NULL,
    "status" "WhatsappTemplateStatus" NOT NULL,

    CONSTRAINT "WhatsappMessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappFlow" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "integrationWhatsappId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "WhatsappFlowStatus" NOT NULL,
    "isCompleted" BOOLEAN NOT NULL,

    CONSTRAINT "WhatsappFlow_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WhatsappMessageTemplate" ADD CONSTRAINT "WhatsappMessageTemplate_integrationWhatsappId_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappFlow" ADD CONSTRAINT "WhatsappFlow_integrationWhatsappId_fkey" FOREIGN KEY ("integrationWhatsappId") REFERENCES "IntegrationWhatsapp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
