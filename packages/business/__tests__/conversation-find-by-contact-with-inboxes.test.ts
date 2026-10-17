// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest"

const { db } = await import("@chatbotx.io/database/client")
const { conversationModel } = await import("@chatbotx.io/database/schema")
const { conversationService } = await import("../src/conversation/service")

const spyOnFindFirst = () =>
  vi.spyOn(db.query.conversationModel, "findFirst" as never)

const activityAndIdOrderSuffix = /DESC NULLS LAST\s+DESC$/

type DrizzleQueryExpression = {
  queryChunks: unknown[]
}

type DrizzleQueryChunk = {
  value: unknown[]
}

const isOrderByCallback = (
  value: unknown,
): value is (table: typeof conversationModel) => unknown =>
  typeof value === "function"

const hasQueryChunks = (value: unknown): value is DrizzleQueryExpression =>
  typeof value === "object" &&
  value !== null &&
  "queryChunks" in value &&
  Array.isArray(value.queryChunks)

const hasValueParts = (value: unknown): value is DrizzleQueryChunk =>
  typeof value === "object" &&
  value !== null &&
  "value" in value &&
  Array.isArray(value.value)

const getOrderBy = (call: unknown): unknown => {
  if (!Array.isArray(call)) {
    return
  }

  const [options] = call
  if (
    typeof options !== "object" ||
    options === null ||
    !("orderBy" in options)
  ) {
    return
  }

  return options.orderBy
}

/**
 * The literal text of the `orderBy` Drizzle receives. Raw SQL arrives through
 * its callback form; query chunks interleave string chunks and column objects.
 */
const orderBySql = (orderBy: unknown): string => {
  const expression = isOrderByCallback(orderBy)
    ? orderBy(conversationModel)
    : orderBy
  const expressions = Array.isArray(expression) ? expression : [expression]

  return expressions
    .flatMap((item) =>
      hasQueryChunks(item)
        ? item.queryChunks.flatMap((chunk) =>
            hasValueParts(chunk) ? chunk.value : [],
          )
        : [],
    )
    .filter((part): part is string => typeof part === "string")
    .join("")
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("conversationService.findByContactWithInboxes", () => {
  // The whole decision needs one statement: with a DM priority, activity
  // recency and an id tie-breaker. Postgres otherwise orders equal timestamps
  // arbitrarily, and a sequential DM probe can miss a concurrent DM insert.
  test("orders DM first, then activity with NULLS LAST and id", async () => {
    const findFirst = spyOnFindFirst().mockResolvedValue({
      id: "conv-dm",
      contactInboxes: [],
    } as never)

    await conversationService.findByContactWithInboxes({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(findFirst).toHaveBeenCalledOnce()
    const orderBy = getOrderBy(findFirst.mock.calls[0])
    const ordering = orderBySql(orderBy)
    expect(ordering).toContain(" IS NOT NULL")
    expect(ordering).toContain("DESC NULLS LAST")
    expect(ordering).toMatch(activityAndIdOrderSuffix)
  })

  // Every caller is a /v1/contacts/{identifier}/messages handler — send, list
  // and get. The service owns the DM-vs-comment choice, so those paths cannot
  // drift and no caller can observe a probe/fallback race.
  test("uses one ordered lookup and returns the DM thread", async () => {
    const directMessage = { id: "conv-dm", sourceId: null, contactInboxes: [] }
    const findFirst = spyOnFindFirst().mockResolvedValue(directMessage as never)

    const result = await conversationService.findByContactWithInboxes({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual(directMessage)
    expect(findFirst).toHaveBeenCalledOnce()
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contactId: "contact-1", workspaceId: "ws-1" },
      }),
    )
  })

  // A contact who has only ever commented has no DM thread to prefer.
  test("returns a comment conversation when there is no DM thread", async () => {
    const commentThread = {
      id: "conv-comment",
      sourceId: "page-1_post-1",
      contactInboxes: [],
    }
    const findFirst = spyOnFindFirst().mockResolvedValue(commentThread as never)

    const result = await conversationService.findByContactWithInboxes({
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual(commentThread)
    expect(findFirst).toHaveBeenCalledOnce()
  })
})
