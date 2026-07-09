UPDATE "ContactInbox" AS ci
SET "firstInteractionAt" = m."firstInteractionAt"
FROM (
  SELECT "contactInboxId", MIN("createdAt") AS "firstInteractionAt"
  FROM "Message"
  GROUP BY "contactInboxId"
) AS m
WHERE ci."id" = m."contactInboxId";
