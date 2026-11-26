// @vitest-environment node

/**
 * `syncChannelConversationId` must write only its own key. It used to spread
 * the `additionalAttributes` snapshot read earlier, so a concurrent writer of
 * another key (`challenge`, later `translation`) was silently overwritten.
 * The fixture is committed and deleted in `afterAll` (workspace deletion
 * cascades to contact and conversation).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import { db, eq, sql } from "@chatbotx.io/database/client"
import {
  contactModel,
  conversationModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import { conversationService } from "../../src/conversation/service"

// The method is private: the race needs a caller holding a stale snapshot,
// which `findOrCreate` (it re-reads first) can't produce deterministically.
const privateSync =
  // biome-ignore lint/complexity/useLiteralKeys: reaching a private method
  conversationService["syncChannelConversationId"]
const syncChannelConversationId = privateSync.bind(conversationService)

/** The shared Vitest preset uses a non-routable port so DB suites self-skip. */
const realDatabaseUrl = (): string | null => {
  const url = process.env.DATABASE_URL
  if (!url) {
    return null
  }
  try {
    return new URL(url).port === "1" ? null : url
  } catch {
    return null
  }
}

const databaseUrl = realDatabaseUrl()

describe.skipIf(!databaseUrl)("syncChannelConversationId", () => {
  let workspaceId: string
  let ownerId: string

  const newConversation = async (
    additionalAttributes?: Record<string, unknown>,
  ) => {
    const [contact] = await db
      .insert(contactModel)
      .values({ workspaceId })
      .returning({ id: contactModel.id })
    const [conversation] = await db
      .insert(conversationModel)
      .values({ workspaceId, contactId: contact.id, additionalAttributes })
      .returning()
    return conversation
  }

  const readAttributes = async (id: string) => {
    const row = await db.query.conversationModel.findFirst({
      where: { id },
      columns: { additionalAttributes: true },
    })
    return row?.additionalAttributes ?? null
  }

  beforeAll(async () => {
    const [owner] = await db
      .insert(userModel)
      .values({ email: `scci-${Date.now()}-${Math.random()}@example.test` })
      .returning({ id: userModel.id })
    ownerId = owner.id
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: "scci", ownerId })
      .returning({ id: workspaceModel.id })
    workspaceId = workspace.id
  })

  afterAll(async () => {
    await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
    await db.delete(userModel).where(eq(userModel.id, ownerId))
  })

  test("keeps a key another writer added after the snapshot was read", async () => {
    // Snapshot read by the sync caller: no `challenge` yet.
    const stale = await newConversation({ channelConversationId: "old" })

    // A concurrent writer (e.g. `setChallenge`) lands before the sync write.
    await db
      .update(conversationModel)
      .set({
        additionalAttributes: sql`jsonb_set(COALESCE(${conversationModel.additionalAttributes}, '{}'::jsonb), '{challenge}', '{"type":"quickReply"}'::jsonb, true)`,
      })
      .where(eq(conversationModel.id, stale.id))

    await syncChannelConversationId({
      conversation: stale,
      channelConversationId: "new",
      tx: db,
    })

    expect(await readAttributes(stale.id)).toEqual({
      channelConversationId: "new",
      challenge: { type: "quickReply" },
    })
  })

  test("writes the key when additionalAttributes is NULL", async () => {
    const conversation = await newConversation()
    expect(conversation.additionalAttributes ?? null).toBeNull()

    await syncChannelConversationId({
      conversation,
      channelConversationId: "fresh",
      tx: db,
    })

    expect(await readAttributes(conversation.id)).toEqual({
      channelConversationId: "fresh",
    })
  })

  test("is a no-op when the id already matches", async () => {
    const conversation = await newConversation({
      channelConversationId: "same",
    })

    const result = await syncChannelConversationId({
      conversation,
      channelConversationId: "same",
      tx: db,
    })

    expect(result).toBe(conversation)
  })
})
