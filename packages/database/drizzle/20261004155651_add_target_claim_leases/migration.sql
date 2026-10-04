ALTER TABLE "ConnectSession" ADD COLUMN "targetClaims" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "ConnectSession"
SET "targetClaims" = COALESCE(
  (
    SELECT jsonb_object_agg(
      target_id,
      jsonb_build_object(
        'ownerToken',
        'legacy',
        'expiresAt',
        '1970-01-01T00:00:00.000Z'
      )
    )
    FROM unnest("claimedTargetIds") AS target_id
  ),
  '{}'::jsonb
);--> statement-breakpoint
ALTER TABLE "ConnectSession" DROP COLUMN "claimedTargetIds";