// @vitest-environment node

/**
 * `humanReplyWindowSet` / `reopenIfUnansweredSince` run through a real UPDATE
 * on `Conversation`, so the CASE expressions are checked by Postgres rather
 * than by SQL text. The fixture is committed and deleted again in `afterAll`
 * (workspace deletion cascades to contact and conversation).
 *
 * Skipped unless `DATABASE_URL` points at a reachable database; run it with
 * `pnpm --filter @chatbotx.io/business test:db`.
 */

import { db, eq } from "@chatbotx.io/database/client"
import {
  contactModel,
  conversationModel,
  userModel,
  workspaceModel,
} from "@chatbotx.io/database/schema"
import { afterAll, beforeAll, describe, expect, test } from "vitest"
import {
  humanReplyWindowSet,
  reopenIfUnansweredSince,
} from "../../src/conversation/human-reply-window"

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

const T0 = new Date("2026-10-18T09:00:00.000Z")
const at = (offsetSeconds: number): Date =>
  new Date(T0.getTime() + offsetSeconds * 1000)

describe.skipIf(!databaseUrl)("human reply window SET expressions", () => {
  let workspaceId: string
  let ownerId: string

  const newConversation = async (
    values: Partial<typeof conversationModel.$inferInsert> = {},
  ): Promise<string> => {
    const [contact] = await db
      .insert(contactModel)
      .values({ workspaceId })
      .returning({ id: contactModel.id })
    const [conversation] = await db
      .insert(conversationModel)
      .values({ workspaceId, contactId: contact.id, ...values })
      .returning({ id: conversationModel.id })
    return conversation.id
  }

  const apply = async (id: string, set: Record<string, unknown>) => {
    await db
      .update(conversationModel)
      .set(set)
      .where(eq(conversationModel.id, id))
  }

  // Mirrors the SET `conversationService.updateBotEnabled(false)` builds: the
  // reopen fragment is applied only when the caller opts in.
  const updateBotEnabled = async (
    id: string,
    options: { reopenUnansweredHumanReplyWindow?: boolean },
  ) => {
    await apply(id, {
      botEnabled: false,
      ...(options.reopenUnansweredHumanReplyWindow
        ? { awaitingHumanReplySince: reopenIfUnansweredSince() }
        : {}),
    })
  }

  const read = async (id: string) => {
    const row = await db.query.conversationModel.findFirst({
      where: { id },
      columns: {
        awaitingHumanReplySince: true,
        awaitingHumanReplyClosedAt: true,
      },
    })
    return {
      since: row?.awaitingHumanReplySince?.getTime() ?? null,
      closedAt: row?.awaitingHumanReplyClosedAt?.getTime() ?? null,
    }
  }

  beforeAll(async () => {
    const [owner] = await db
      .insert(userModel)
      .values({ email: `hrwu-${Date.now()}-${Math.random()}@example.test` })
      .returning({ id: userModel.id })
    ownerId = owner.id
    const [workspace] = await db
      .insert(workspaceModel)
      .values({ name: "hrwu", ownerId })
      .returning({ id: workspaceModel.id })
    workspaceId = workspace.id
  })

  afterAll(async () => {
    await db.delete(workspaceModel).where(eq(workspaceModel.id, workspaceId))
    await db.delete(userModel).where(eq(userModel.id, ownerId))
  })

  test("open sets the start and keeps the earliest one", async () => {
    const fresh = await newConversation()
    const existing = await newConversation({ awaitingHumanReplySince: at(-60) })

    await apply(fresh, humanReplyWindowSet({ open: at(0) }))
    await apply(existing, humanReplyWindowSet({ open: at(0) }))

    expect((await read(fresh)).since).toBe(at(0).getTime())
    expect((await read(existing)).since).toBe(at(-60).getTime())
  })

  test("a stale open (at or before the last close) is ignored", async () => {
    const id = await newConversation({ awaitingHumanReplyClosedAt: at(10) })

    await apply(id, humanReplyWindowSet({ open: at(5) }))
    await apply(id, humanReplyWindowSet({ open: at(10) }))

    expect((await read(id)).since).toBeNull()
  })

  test("close clears a window that started before it and records the close instant", async () => {
    const id = await newConversation({ awaitingHumanReplySince: at(0) })

    await apply(id, humanReplyWindowSet({ close: at(300), actor: "archive" }))

    expect(await read(id)).toEqual({ since: null, closedAt: at(300).getTime() })
  })

  test("a window opened after the close instant (since > at) is kept", async () => {
    const id = await newConversation({ awaitingHumanReplySince: at(600) })

    await apply(
      id,
      humanReplyWindowSet({ close: at(300), actor: "externalHuman" }),
    )

    expect(await read(id)).toEqual({
      since: at(600).getTime(),
      closedAt: at(300).getTime(),
    })
  })

  test("a bot close clears an enabled conversation without advancing the marker, and leaves a paused one untouched", async () => {
    const enabled = await newConversation({ awaitingHumanReplySince: at(0) })
    const paused = await newConversation({
      awaitingHumanReplySince: at(0),
      botEnabled: false,
    })

    await apply(enabled, humanReplyWindowSet({ close: at(300), actor: "bot" }))
    await apply(paused, humanReplyWindowSet({ close: at(300), actor: "bot" }))

    expect(await read(enabled)).toEqual({ since: null, closedAt: null })
    expect(await read(paused)).toEqual({
      since: at(0).getTime(),
      closedAt: null,
    })
  })

  test("a stale inbound after a HUMAN close is ignored", async () => {
    const id = await newConversation({ awaitingHumanReplySince: at(0) })

    await apply(
      id,
      humanReplyWindowSet({ close: at(300), actor: "externalHuman" }),
    )
    await apply(id, humanReplyWindowSet({ open: at(200) }))

    expect((await read(id)).since).toBeNull()
  })

  test("flow Disable Bot after a bot message reopens the window (opt-in pause)", async () => {
    const id = await newConversation({
      contactRepliedAt: at(0),
      awaitingHumanReplySince: at(0),
    })

    await apply(id, humanReplyWindowSet({ close: at(30), actor: "bot" }))
    await updateBotEnabled(id, { reopenUnansweredHumanReplyWindow: true })

    expect((await read(id)).since).toBe(at(0).getTime())
  })

  test("a manual pause long after the bot answered leaves the window closed", async () => {
    const id = await newConversation({
      contactRepliedAt: at(0),
      awaitingHumanReplySince: at(0),
    })

    await apply(id, humanReplyWindowSet({ close: at(30), actor: "bot" }))
    await updateBotEnabled(id, {})

    expect((await read(id)).since).toBeNull()
  })

  test("bot message then pause reopens the window at the contact's message", async () => {
    const id = await newConversation({
      contactRepliedAt: at(0),
      awaitingHumanReplySince: at(0),
    })

    await apply(id, humanReplyWindowSet({ close: at(30), actor: "bot" }))
    await apply(id, { awaitingHumanReplySince: reopenIfUnansweredSince() })

    expect((await read(id)).since).toBe(at(0).getTime())
  })

  test.each([
    "externalHuman",
    "archive",
  ] as const)("%s close then pause keeps the window closed", async (actor) => {
    const id = await newConversation({
      contactRepliedAt: at(0),
      awaitingHumanReplySince: at(0),
    })

    await apply(id, humanReplyWindowSet({ close: at(30), actor }))
    await apply(id, { awaitingHumanReplySince: reopenIfUnansweredSince() })

    expect((await read(id)).since).toBeNull()
  })

  test("a comment thread (sourceId set) is never opened or closed", async () => {
    const opened = await newConversation({ sourceId: "post-1" })
    const closed = await newConversation({
      sourceId: "post-2",
      awaitingHumanReplySince: at(0),
    })

    await apply(opened, humanReplyWindowSet({ open: at(0) }))
    await apply(
      closed,
      humanReplyWindowSet({ close: at(300), actor: "archive" }),
    )

    expect(await read(opened)).toEqual({ since: null, closedAt: null })
    expect(await read(closed)).toEqual({
      since: at(0).getTime(),
      closedAt: null,
    })
  })

  test("reopen restores the start only for an unanswered, unclosed DM message", async () => {
    const unanswered = await newConversation({ contactRepliedAt: at(0) })
    const answered = await newConversation({
      contactRepliedAt: at(0),
      adminRepliedAt: at(60),
    })
    const closedSince = await newConversation({
      contactRepliedAt: at(0),
      awaitingHumanReplyClosedAt: at(30),
    })
    const alreadyOpen = await newConversation({
      contactRepliedAt: at(0),
      awaitingHumanReplySince: at(-100),
    })
    const comment = await newConversation({
      contactRepliedAt: at(0),
      sourceId: "post-3",
    })

    for (const id of [
      unanswered,
      answered,
      closedSince,
      alreadyOpen,
      comment,
    ]) {
      await apply(id, { awaitingHumanReplySince: reopenIfUnansweredSince() })
    }

    expect((await read(unanswered)).since).toBe(at(0).getTime())
    expect((await read(answered)).since).toBeNull()
    expect((await read(closedSince)).since).toBeNull()
    expect((await read(alreadyOpen)).since).toBe(at(-100).getTime())
    expect((await read(comment)).since).toBeNull()
  })
})
