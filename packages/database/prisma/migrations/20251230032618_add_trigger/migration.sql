DROP TABLE IF EXISTS "TriggerCondition";
DROP TABLE IF EXISTS "TriggerStats";
DROP TABLE IF EXISTS "TriggerContactHistory";
DROP TABLE IF EXISTS "TriggerExecution";
DROP TABLE IF EXISTS "Trigger";

ALTER TYPE "FolderType" ADD VALUE IF NOT EXISTS 'trigger';

CREATE TABLE "Trigger" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "folderId" TEXT,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "Trigger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TriggerCondition" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerId" TEXT NOT NULL,
    "type" SMALLINT NOT NULL,
    "sourceId" TEXT,
    "operator" VARCHAR(255),
    "value" JSONB,

    CONSTRAINT "TriggerCondition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Trigger_chatbotId_name_key" ON "Trigger"("chatbotId", "name");
CREATE INDEX "Trigger_chatbotId_idx" ON "Trigger"("chatbotId");
CREATE INDEX "Trigger_folderId_idx" ON "Trigger"("folderId");
CREATE INDEX "Trigger_chatbotId_active_idx" ON "Trigger"("chatbotId", "active");
CREATE INDEX "TriggerCondition_type_sourceId_idx" ON "TriggerCondition"("type", "sourceId");
CREATE INDEX "TriggerCondition_triggerId_idx" ON "TriggerCondition"("triggerId");
CREATE INDEX "TriggerCondition_type_sourceId_triggerId_idx" ON "TriggerCondition"("type", "sourceId", "triggerId");

ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trigger" ADD CONSTRAINT "Trigger_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TriggerCondition" ADD CONSTRAINT "TriggerCondition_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TriggerStats" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalContacts" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "totalExecutions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TriggerStats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TriggerContactHistory" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,
    "firstEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TriggerContactHistory_pkey" PRIMARY KEY ("id", "contactId")
) PARTITION BY HASH ("contactId");

DO $$
DECLARE
    i INTEGER;
BEGIN
    FOR i IN 0..63 LOOP
        EXECUTE format('CREATE TABLE "TriggerContactHistory_p%s" PARTITION OF "TriggerContactHistory" FOR VALUES WITH (MODULUS 64, REMAINDER %s)', i, i);
    END LOOP;
END $$;

CREATE UNIQUE INDEX "TriggerStats_triggerId_date_key" ON "TriggerStats"("triggerId", "date");
CREATE INDEX "TriggerStats_triggerId_date_idx" ON "TriggerStats"("triggerId", "date");
CREATE INDEX "TriggerStats_chatbotId_date_idx" ON "TriggerStats"("chatbotId", "date");
CREATE INDEX "TriggerContactHistory_triggerId_contactId_idx" ON "TriggerContactHistory"("triggerId", "contactId");
CREATE INDEX "TriggerContactHistory_contactId_idx" ON "TriggerContactHistory"("contactId");
CREATE INDEX "TriggerContactHistory_chatbotId_idx" ON "TriggerContactHistory"("chatbotId");

ALTER TABLE "TriggerStats" ADD CONSTRAINT "TriggerStats_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriggerStats" ADD CONSTRAINT "TriggerStats_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriggerContactHistory" ADD CONSTRAINT "TriggerContactHistory_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TriggerExecution" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggerId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "chatbotId" TEXT NOT NULL,

    CONSTRAINT "TriggerExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TriggerExecution_triggerId_contactId_idx" ON "TriggerExecution"("triggerId", "contactId");
CREATE INDEX "TriggerExecution_chatbotId_idx" ON "TriggerExecution"("chatbotId");

ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "Trigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TriggerExecution" ADD CONSTRAINT "TriggerExecution_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add index for ContactCustomField.customFieldId to optimize datetime trigger scanning
CREATE INDEX IF NOT EXISTS "ContactCustomField_customFieldId_idx" ON "ContactCustomField"("customFieldId");
