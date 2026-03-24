-- Custom SQL migration file, put your code below! ---- Backfill inbox names from linked integration records.
UPDATE "Inbox" AS i
SET "name" = COALESCE(
  NULLIF(im."name", ''),
  NULLIF(iw."name", ''),
  NULLIF(iz."name", ''),
  NULLIF(iwc."name", ''),
  i."name"
)
FROM "Inbox" base
LEFT JOIN "IntegrationMessenger" AS im ON im."inboxId" = base."id"
LEFT JOIN "IntegrationWhatsapp" AS iw ON iw."inboxId" = base."id"
LEFT JOIN "IntegrationZalo" AS iz ON iz."inboxId" = base."id"
LEFT JOIN "IntegrationWebchat" AS iwc ON iwc."inboxId" = base."id"
WHERE i."id" = base."id"
  AND i."name" = '';
