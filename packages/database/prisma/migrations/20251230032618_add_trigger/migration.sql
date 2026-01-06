-- CreateTable
CREATE TABLE "Trigger" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "folderId" TEXT,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Trigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TriggerConditionIndex" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventSourceId" TEXT,

    CONSTRAINT "TriggerConditionIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trigger_chatbotId_idx" ON "Trigger"("chatbotId");

-- CreateIndex
CREATE INDEX "Trigger_folderId_idx" ON "Trigger"("folderId");

-- CreateIndex
CREATE INDEX "Trigger_chatbotId_active_idx" ON "Trigger"("chatbotId", "active");

-- CreateIndex
CREATE INDEX "TriggerConditionIndex_eventType_eventSourceId_idx" ON "TriggerConditionIndex"("eventType", "eventSourceId");

-- CreateIndex
CREATE INDEX "TriggerConditionIndex_triggerId_idx" ON "TriggerConditionIndex"("triggerId");

-- CreateIndex
CREATE INDEX "TriggerConditionIndex_eventType_eventSourceId_triggerId_idx" ON "TriggerConditionIndex"("eventType", "eventSourceId", "triggerId");

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerConditionIndex" ADD CONSTRAINT "TriggerConditionIndex_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: TriggerExecution for tracking contact trigger executions
-- Partitioned by HASH(contactId) with 64 partitions for horizontal scaling
CREATE TABLE "TriggerExecution" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMsg" TEXT,

    CONSTRAINT "TriggerExecution_pkey" PRIMARY KEY ("id", "contactId")
) PARTITION BY HASH ("contactId");

-- Create 64 partitions for horizontal scaling
-- Each partition will store ~1/64 of the data, distributed by contactId hash
DO $$
DECLARE
    i INTEGER;
BEGIN
    FOR i IN 0..63 LOOP
        EXECUTE format('CREATE TABLE "TriggerExecution_p%s" PARTITION OF "TriggerExecution" FOR VALUES WITH (MODULUS 64, REMAINDER %s)', i, i);
    END LOOP;
END $$;

-- CreateIndex: Analytics - "How many contacts entered trigger X?"
CREATE INDEX "TriggerExecution_triggerId_executedAt_idx" ON "TriggerExecution"("triggerId", "executedAt");

-- CreateIndex: Contact history - "Which triggers did this contact enter?"
CREATE INDEX "TriggerExecution_contactId_executedAt_idx" ON "TriggerExecution"("contactId", "executedAt");

-- CreateIndex: Chatbot-level analytics
CREATE INDEX "TriggerExecution_chatbotId_executedAt_idx" ON "TriggerExecution"("chatbotId", "executedAt");

-- CreateIndex: Unique constraint to prevent duplicate executions
CREATE UNIQUE INDEX "TriggerExecution_triggerId_contactId_key" ON "TriggerExecution"("triggerId", "contactId");

-- AddForeignKey
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
