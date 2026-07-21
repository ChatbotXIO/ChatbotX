ALTER TABLE "ContactOnSmartDelay" ADD COLUMN IF NOT EXISTS "metadata" jsonb;

UPDATE "ContactOnSmartDelay" AS sd
SET "metadata" = (
  SELECT jsonb_build_object(
    'type', 'broadcast',
    'broadcastId', cob."broadcastId"::text,
    'contactInboxId', cob."contactInboxId"::text
  )
  FROM "ContactOnBroadcast" AS cob
  INNER JOIN "Broadcast" AS b
    ON b."id" = cob."broadcastId"
  WHERE cob."conversationId" = sd."conversationId"
    AND cob."contactInboxId" = sd."contactInboxId"
    AND b."workspaceId" = sd."workspaceId"
    AND b."flowId" = sd."flowId"
    AND b."schedulesAt" <= sd."createdAt"
  ORDER BY b."schedulesAt" DESC
  LIMIT 1
)
WHERE sd."metadata" IS NULL
  AND sd."status" IN ('pending', 'scheduled')
  AND EXISTS (
    SELECT 1
    FROM "ContactOnBroadcast" AS cob
    INNER JOIN "Broadcast" AS b
      ON b."id" = cob."broadcastId"
    WHERE cob."conversationId" = sd."conversationId"
      AND cob."contactInboxId" = sd."contactInboxId"
      AND b."workspaceId" = sd."workspaceId"
      AND b."flowId" = sd."flowId"
      AND b."schedulesAt" <= sd."createdAt"
  );
