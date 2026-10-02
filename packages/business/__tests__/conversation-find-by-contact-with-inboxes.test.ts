// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"

const { db } = await import("@chatbotx.io/database/client")
const { conversationModel } = await import("@chatbotx.io/database/schema")
const { conversationService } = await import("../src/conversation/service")

const spyOnFindFirst = () =>
  vi.spyOn(db.query.conversationModel, "findFirst" as never)

/**
 * The literal text of the `orderBy` drizzle was handed.
 *
 * It arrives as drizzle's callback form — the only form that accepts a raw SQL
 * expression — so it is invoked first. `queryChunks` then interleaves
 * `StringChunk` (whose `value` is a string array) with column references, and
 * those reference their table, so the object as a whole cannot be stringified.
 */
const orderBySql = (orderBy: unknown): string => {
  const expression =
    typeof orderBy === "function"
      ? (orderBy as (table: unknown) => unknown)(conversationModel)
      : orderBy
  return ((expression as { queryChunks?: unknown[] }).queryChunks ?? [])
    .flatMap((chunk) => (chunk as { value?: unknown }).value ?? [])
    .filter((part): part is string => typeof part === "string")
    .join("")
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("conversationService.findByContactWithInboxes", () => {
  // `lastActivityAt` is nullable with no default, and Postgres puts NULLs FIRST
  // on a plain DESC — so the object form `{ lastActivityAt: "desc" }` would
  // rank a conversation that has never been active above every real one.
  test("orders by lastActivityAt with NULLS LAST, not a bare DESC", async () => {
    const findFirst = spyOnFindFirst().mockResolvedValue({
      id: "conv-dm",
      contactInboxes: [],
    } as never)

    await conversationService.findByContactWithInboxes({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    const { orderBy } = findFirst.mock.calls[0]?.[0] as { orderBy: unknown }
    expect(orderBySql(orderBy)).toContain("DESC NULLS LAST")
  })

  // Every caller is a /v1/contacts/{identifier}/messages handler — send, list
  // and get. When only the send path preferred the DM thread, an integrator
  // could POST, get 204, then list and not find the message. There is no flag
  // to forget, so the three cannot drift.
  // `Conversation_contactId_dm_key` is unique on contactId where sourceId IS
  // NULL, so this probe can match at most one row.
  test("probes the DM thread first, with no caller opt-in", async () => {
    const directMessage = { id: "conv-dm", sourceId: null, contactInboxes: [] }
    const findFirst = spyOnFindFirst().mockResolvedValue(directMessage as never)

    const result = await conversationService.findByContactWithInboxes({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual(directMessage)
    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          contactId: "contact-1",
          workspaceId: "ws-1",
          sourceId: { isNull: true },
        },
      }),
    )
  })

  // A contact who has only ever commented has no DM thread to prefer. Falling
  // through to the unfiltered lookup is what keeps them reachable.
  test("falls back to any conversation when the contact has no DM thread", async () => {
    const commentThread = {
      id: "conv-comment",
      sourceId: "page-1_post-1",
      contactInboxes: [],
    }
    const findFirst = spyOnFindFirst()
      .mockResolvedValueOnce(undefined as never)
      .mockResolvedValueOnce(commentThread as never)

    const result = await conversationService.findByContactWithInboxes({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual(commentThread)
    expect(findFirst).toHaveBeenCalledTimes(2)
    expect(findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { contactId: "contact-1", workspaceId: "ws-1" },
      }),
    )
  })
})
