-- Normalize TikTok DM conversations onto the repo-wide `sourceId IS NULL`
-- convention.
--
-- TikTok used to store the channel's `conversation_id` directly in
-- `Conversation.sourceId` — the one slot reserved everywhere else for comment
-- threads, keyed by the post id. That left no room for TikTok comment threads:
-- a contact would end up with two non-null-sourceId conversations and
-- `findDMByContact` would return whichever came first. The id now lives on
-- `additionalAttributes.channelConversationId`, read back through
-- `resolveChannelConversationId` (packages/database/src/partials/channel.ts).

-- Step 1 — additive and always safe: copy the id onto additionalAttributes.
-- Runs for every TikTok conversation that still carries one, including the
-- rows step 2 deliberately leaves alone, so the outbound send path can address
-- the DM either way.
UPDATE "Conversation" AS c
SET "additionalAttributes" =
      COALESCE(c."additionalAttributes", '{}'::jsonb)
      || jsonb_build_object('channelConversationId', c."sourceId")
WHERE c."sourceId" IS NOT NULL
  AND (c."additionalAttributes" -> 'channelConversationId') IS NULL
  AND EXISTS (
    SELECT 1
    FROM "ContactInbox" ci
    WHERE ci."contactId" = c."contactId"
      AND ci."channel" = 'tiktok'
  );
--> statement-breakpoint

-- Step 2 — free up `sourceId`, but only where doing so cannot violate
-- `Conversation_contactId_dm_key` (unique on contactId where sourceId IS NULL).
--
-- A contact that already has a null-sourceId conversation is skipped rather
-- than merged: merging carries messages, flow state and read receipts, which is
-- not a decision a migration should make silently. Those rows keep their
-- `sourceId` and still send correctly via the value step 1 wrote, so nothing
-- breaks — they just need reconciling by hand. Expected to be rare or empty:
-- before this change nothing created a null-sourceId conversation for a
-- TikTok-only contact.
UPDATE "Conversation" AS c
SET "sourceId" = NULL
WHERE c."sourceId" IS NOT NULL
  AND (c."additionalAttributes" -> 'channelConversationId') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "ContactInbox" ci
    WHERE ci."contactId" = c."contactId"
      AND ci."channel" = 'tiktok'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Conversation" other
    WHERE other."contactId" = c."contactId"
      AND other."sourceId" IS NULL
  );
