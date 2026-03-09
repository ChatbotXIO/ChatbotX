-- Custom SQL migration file, put your code below! --

UPDATE "Conversation" AS c
SET "sourceId" = ct."sourceId"
FROM "Contact" AS ct
WHERE c."contactId" = ct."id"
  AND c."inboxType" = 'messenger'
  AND c."chatbotId" = ct."chatbotId";
