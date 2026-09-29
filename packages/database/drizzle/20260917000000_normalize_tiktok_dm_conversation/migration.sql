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

-- `Conversation` carries no inbox or channel column — only `contactId` and
-- `sourceId` — so "is this a TikTok conversation?" can only be asked of the
-- contact. A contact that also has a Meta inbox owns comment conversations
-- keyed by a Facebook/Instagram post id, and those are indistinguishable here
-- from a TikTok DM. Both steps below therefore restrict themselves to contacts
-- whose inboxes are ALL TikTok; a cross-channel contact is left untouched and
-- keeps sending via the `sourceId` fallback in `resolveChannelConversationId`.
--
-- Without that restriction step 2 nulls the `sourceId` of a Meta comment thread
-- (losing the post anchor irreversibly), and a contact holding two such threads
-- has both rows nulled from the same snapshot — violating
-- `Conversation_contactId_dm_key` and aborting the migration part-way.

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
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "ContactInbox" ci2
    WHERE ci2."contactId" = c."contactId"
      AND ci2."channel" <> 'tiktok'
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
    FROM "ContactInbox" ci2
    WHERE ci2."contactId" = c."contactId"
      AND ci2."channel" <> 'tiktok'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "Conversation" other
    WHERE other."contactId" = c."contactId"
      AND other."sourceId" IS NULL
  );
