-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('Scheduled', 'Sent');

-- CreateEnum
CREATE TYPE "BroadcastType" AS ENUM ('Omnichannel', 'ChatWidget', 'Messenger', 'Whatsapp', 'Instagram');

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "broadcastType" "BroadcastType" NOT NULL,
    "status" "BroadcastStatus" NOT NULL,
    "schedulesAt" TIMESTAMP(3) NOT NULL,
    "conditions" JSONB,

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactsOnBroadcasts" (
    "broadcastId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "failed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ContactsOnBroadcasts_pkey" PRIMARY KEY ("broadcastId","contactId")
);

-- CreateIndex
CREATE INDEX "Broadcast_chatbotId_idx" ON "Broadcast"("chatbotId");

-- CreateIndex
CREATE INDEX "Broadcast_flowId_idx" ON "Broadcast"("flowId");

-- CreateIndex
CREATE INDEX "Broadcast_schedulesAt_idx" ON "Broadcast"("schedulesAt");

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "Flow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactsOnBroadcasts" ADD CONSTRAINT "ContactsOnBroadcasts_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactsOnBroadcasts" ADD CONSTRAINT "ContactsOnBroadcasts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
