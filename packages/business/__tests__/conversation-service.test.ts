import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  broadcastToWorkspaceParty,
  execute,
  chatQueueAdd,
  conversationFindFirst,
  createMessageRepository,
  findLastByConversation,
  invalidateCacheByTags,
  invalidateTracking,
  returning,
  selectWhere,
  set,
  transaction,
  update,
  updateTracking,
  where,
} = vi.hoisted(() => {
  const returning = vi.fn().mockResolvedValue([])
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return {
    broadcastToWorkspaceParty: vi.fn().mockResolvedValue(undefined),
    chatQueueAdd: vi.fn().mockResolvedValue(undefined),
    conversationFindFirst: vi.fn(),
    createMessageRepository: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
    findLastByConversation: vi.fn(),
    invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
    invalidateTracking: vi.fn().mockResolvedValue(undefined),
    returning,
    selectWhere: vi.fn(),
    set,
    transaction: vi
      .fn()
      .mockImplementation((fn: (tx: { update: typeof update }) => unknown) =>
        fn({ update }),
      ),
    update,
    updateTracking: vi
      .fn()
      .mockResolvedValue({ cacheTags: ["contacts:contact-1:contact-inboxes"] }),
    where,
  }
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return {
    ...original,
    db: {
      transaction,
      update,
      execute,
      query: {
        conversationModel: { findFirst: conversationFindFirst },
      },
      select: vi.fn(() => ({
        from: (table: unknown) => ({
          where: (condition: unknown) => {
            selectWhere(condition)
            return {
              getSQL: () =>
                original.sql`select 1 from ${table} where ${condition}`,
            }
          },
        }),
      })),
    },
  }
})
vi.mock("@chatbotx.io/database/repositories", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/database/repositories")>()
  return { ...original, createMessageRepository }
})
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/worker-config")>()
  return { ...original, chatQueue: { add: chatQueueAdd } }
})
vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: {
    invalidateTracking,
    updateTracking,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags,
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))

vi.mock("../src/platform/realtime-broadcast", () => ({
  broadcastToWorkspaceParty,
}))

// `conversationService` now imports `contactService` (for the location write
// inside `recordInboundActivity`), which pulls the analytics package into the
// import chain; its MAC tracking service reads `bloomFilter` off
// `@chatbotx.io/redis` at module scope. Stub analytics rather than partially
// mocking redis — matches the contact-service tests' convention.
vi.mock("@chatbotx.io/analytics", () => ({
  macAnalyticsService: {},
}))

const { conversationService } = await import("../src/conversation/service")

/**
 * Shared recursive, WeakSet-guarded traversal of a Drizzle SQL object tree.
 * Calls `visit(node)` for every reached node — primitives and `Date`
 * instances included (neither is added to `seen` or recursed into, mirroring
 * how Drizzle's own leaf values behave) — then recurses into arrays/object
 * properties unless `visit` returns `true` to prune that subtree. Each
 * `collectSql*` helper below is a thin wrapper supplying its own `visit`
 * predicate; none of their extraction semantics changed.
 */
function walkSqlNode(
  node: unknown,
  visit: (node: unknown) => boolean | undefined,
  seen: WeakSet<object> = new WeakSet(),
): void {
  if (node === null || node === undefined) {
    return
  }
  if (node instanceof Date || typeof node !== "object") {
    visit(node)
    return
  }
  if (seen.has(node)) {
    return
  }
  seen.add(node)
  if (visit(node)) {
    return
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walkSqlNode(item, visit, seen)
    }
    return
  }
  for (const val of Object.values(node as Record<string, unknown>)) {
    walkSqlNode(val, visit, seen)
  }
}

// Recursively collect bound parameter values from a Drizzle SQL object.
// Drizzle stores user-supplied values as { value: T } nodes inside queryChunks.
function collectSqlValues(
  node: unknown,
  seen = new WeakSet(),
  out: unknown[] = [],
): unknown[] {
  walkSqlNode(
    node,
    (n) => {
      if (n === null || typeof n !== "object" || Array.isArray(n)) {
        return
      }
      const obj = n as Record<string, unknown>
      if (
        "value" in obj &&
        obj.value !== null &&
        (obj.value instanceof Date || typeof obj.value !== "object")
      ) {
        out.push(obj.value)
      }
    },
    seen,
  )
  return out
}

// Recursively collect literal SQL text from a Drizzle SQL object's
// StringChunks (`{ value: string[] }` nodes), joined in traversal order.
function collectSqlText(
  node: unknown,
  seen = new WeakSet(),
  out: string[] = [],
): string {
  walkSqlNode(
    node,
    (n) => {
      if (n === null || typeof n !== "object" || Array.isArray(n)) {
        return
      }
      const obj = n as Record<string, unknown>
      if (
        Array.isArray(obj.value) &&
        obj.value.every((v) => typeof v === "string")
      ) {
        out.push(...(obj.value as string[]))
      }
    },
    seen,
  )
  return out.join("")
}

// `collectSqlValues` above only finds values Drizzle wraps as `{ value }`
// nodes (e.g. via `eq()`/`Param`). Raw ``sql`...${x}...``` template literals
// (used by `bulkAdvanceActivityAndAiContextMarker`) embed interpolated values
// directly in `queryChunks`, skipping only the literal-text `StringChunk`
// nodes. This walks those raw params instead.
function collectSqlParams(
  node: unknown,
  seen = new WeakSet(),
  out: unknown[] = [],
): unknown[] {
  walkSqlNode(
    node,
    (n) => {
      if (n instanceof Date || (n !== null && typeof n !== "object")) {
        out.push(n)
        return true
      }
      const ctorName = (n as { constructor?: { name?: string } }).constructor
        ?.name
      if (ctorName === "StringChunk") {
        return true
      }
      return false
    },
    seen,
  )
  return out
}

describe("conversationService.updateAIContextLastMessageId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("updates with workspace scope and invalidates conversation cache tags", async () => {
    await conversationService.updateAIContextLastMessageId({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      messageId: "10",
    })

    expect(set).toHaveBeenCalledWith({ aiContextLastMessageId: "10" })
    expect(where).toHaveBeenCalledTimes(1)

    const whereValues = collectSqlValues(where.mock.calls[0][0])
    expect(whereValues).toContain("conv-1")
    expect(whereValues).toContain("ws-1")

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "conversations",
      "conversations:ws-1",
      "conversations:conv-1",
    ])
  })

  test("scopes the null messageId update to the correct workspace", async () => {
    await conversationService.updateAIContextLastMessageId({
      workspaceId: "ws-2",
      conversationId: "conv-2",
      messageId: null,
    })

    expect(set).toHaveBeenCalledWith({ aiContextLastMessageId: null })

    const whereValues = collectSqlValues(where.mock.calls[0][0])
    expect(whereValues).toContain("conv-2")
    expect(whereValues).toContain("ws-2")
  })
})

describe("conversationService.bulkAdvanceActivityAndAiContextMarker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("is a no-op (no query, no invalidation) when rows is empty", async () => {
    await conversationService.bulkAdvanceActivityAndAiContextMarker({
      workspaceId: "ws-1",
      rows: [],
    })

    expect(execute).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
  })

  test("issues exactly ONE advance-only, NULL-guarded UPDATE for the whole bulk", async () => {
    const newestMessageAt = new Date("2026-07-01T00:00:00.000Z")
    await conversationService.bulkAdvanceActivityAndAiContextMarker({
      workspaceId: "ws-1",
      rows: [
        {
          conversationId: "conv-1",
          newestMessageAt,
          aiMarkerMessageId: "100000000000001",
        },
        {
          // A row can carry only a marker — dates null, marker set.
          conversationId: "conv-2",
          newestMessageAt: null,
          aiMarkerMessageId: "200000000000002",
        },
      ],
    })

    expect(execute).toHaveBeenCalledTimes(1)
    const sqlArg = execute.mock.calls[0][0]
    const sqlText = collectSqlText(sqlArg)

    // Advance-only CASE expressions guard both columns.
    expect(sqlText).toContain('"lastActivityAt"')
    expect(sqlText).toContain('"aiContextLastMessageId"')
    expect(sqlText).toContain("u.ts IS NOT NULL")
    expect(sqlText).toContain("u.marker IS NOT NULL")

    const params = collectSqlParams(sqlArg)
    expect(params).toContain("conv-1")
    expect(params).toContain("conv-2")
    expect(params).toContain("100000000000001")
    expect(params).toContain("200000000000002")
    expect(params).toContainEqual(newestMessageAt)
  })

  test("invalidates conversation cache tags for every affected conversation id", async () => {
    await conversationService.bulkAdvanceActivityAndAiContextMarker({
      workspaceId: "ws-1",
      rows: [
        {
          conversationId: "conv-1",
          newestMessageAt: new Date("2026-07-01T00:00:00.000Z"),
          aiMarkerMessageId: "100000000000001",
        },
        {
          conversationId: "conv-2",
          newestMessageAt: null,
          aiMarkerMessageId: null,
        },
      ],
    })

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "conversations",
      "conversations:ws-1",
      "conversations:conv-1",
      "conversations:conv-2",
    ])
  })
})

describe("conversationService.markReadByContact", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateTracking.mockResolvedValue({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
  })

  test("updates read timestamps, invalidates contact-inbox tracking, and invalidates conversation cache", async () => {
    const seenAt = new Date("2026-07-14T00:00:00.000Z")

    await conversationService.markReadByContact({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      seenAt,
    })

    expect(transaction).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith({ contactLastReadAt: seenAt })

    const whereValues = collectSqlValues(where.mock.calls[0][0])
    expect(whereValues).toContain("conv-1")
    expect(whereValues).toContain("ws-1")

    expect(updateTracking).toHaveBeenCalledWith({
      tx: expect.objectContaining({ update }),
      contactInboxId: "ci-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
      data: { contactLastReadAt: seenAt },
    })
    expect(invalidateTracking).toHaveBeenCalledWith({
      cacheTags: ["contacts:contact-1:contact-inboxes"],
    })
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "conversations",
      "conversations:ws-1",
      "conversations:conv-1",
    ])
  })

  test("skips contact-inbox invalidation when tracking update returns null but still invalidates conversation cache", async () => {
    const seenAt = new Date("2026-07-14T00:00:00.000Z")
    updateTracking.mockResolvedValueOnce(null)

    await conversationService.markReadByContact({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      contactInboxId: "ci-1",
      contactId: "contact-1",
      seenAt,
    })

    expect(invalidateTracking).not.toHaveBeenCalled()
    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "conversations",
      "conversations:ws-1",
      "conversations:conv-1",
    ])
  })
})

describe("conversationService.markReadByOutbound", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    returning.mockResolvedValue([])
    createMessageRepository.mockResolvedValue({ findLastByConversation })
  })

  test("advances an older read timestamp, invalidates, and broadcasts a realtime update", async () => {
    const readAt = new Date("2026-09-23T12:00:00.000Z")
    returning.mockResolvedValueOnce([{ id: "conv-1" }])

    await expect(
      conversationService.markReadByOutbound({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        inboxId: "inbox-1",
        readAt,
      }),
    ).resolves.toBe(true)

    expect(set).toHaveBeenCalledWith({ agentLastReadAt: readAt })
    expect(returning).toHaveBeenCalledWith({
      id: expect.anything(),
    })

    const whereExpression = where.mock.calls[0][0]
    const whereValues = collectSqlValues(whereExpression)
    const inboxWhereValues = collectSqlValues(selectWhere.mock.calls[0][0])
    const whereSqlText = collectSqlText(whereExpression).toLowerCase()
    expect(whereValues).toContain("conv-1")
    expect(whereValues).toContain("ws-1")
    expect(whereValues).toContain(readAt)
    expect(inboxWhereValues).toContain("inbox-1")
    expect(inboxWhereValues).toContain("ws-1")
    expect(inboxWhereValues).toContain(true)
    expect(whereSqlText).toContain(" < ")
    expect(whereSqlText).not.toContain(" >= ")
    expect(whereSqlText).toContain("is null")
    expect(whereSqlText).toContain("exists")

    expect(invalidateCacheByTags).toHaveBeenCalledWith([
      "conversations",
      "conversations:ws-1",
      "conversations:conv-1",
    ])
    expect(broadcastToWorkspaceParty).toHaveBeenCalledWith("ws-1", {
      eventType: "conversationUpdated",
      data: {
        conversationIds: ["conv-1"],
        changes: { agentLastReadAt: readAt.toISOString() },
      },
    })
  })

  test("leaves a newer read timestamp alone without invalidating or broadcasting", async () => {
    const readAt = new Date("2026-09-23T12:00:00.000Z")

    await expect(
      conversationService.markReadByOutbound({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        inboxId: "inbox-1",
        readAt,
      }),
    ).resolves.toBe(false)

    const whereExpression = where.mock.calls[0][0]
    expect(collectSqlValues(whereExpression)).toContain(readAt)
    expect(collectSqlText(whereExpression)).toContain(" < ")
    expect(invalidateCacheByTags).not.toHaveBeenCalled()
    expect(broadcastToWorkspaceParty).not.toHaveBeenCalled()
  })

  test("a delivery confirmed after a manual mark-unread re-reads up to the reply", async () => {
    const manualUnreadAt = new Date("2026-09-23T11:00:00.000Z")
    const deliveredReplyAt = new Date("2026-09-23T12:00:00.000Z")
    conversationFindFirst.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: deliveredReplyAt,
      createdAt: new Date("2026-09-22T12:00:00.000Z"),
    })
    findLastByConversation.mockResolvedValue([
      { createdAt: deliveredReplyAt },
      { createdAt: manualUnreadAt },
    ])
    returning.mockResolvedValueOnce([{ id: "conv-1" }])

    await conversationService.markUnread({
      workspaceId: "ws-1",
      id: "conv-1",
    })
    await conversationService.markReadByOutbound({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      inboxId: "inbox-1",
      readAt: deliveredReplyAt,
    })

    expect(set).toHaveBeenNthCalledWith(1, {
      agentLastReadAt: manualUnreadAt,
    })
    expect(set).toHaveBeenNthCalledWith(2, {
      agentLastReadAt: deliveredReplyAt,
    })

    const outboundWhereExpression = where.mock.calls[1][0]
    expect(collectSqlText(outboundWhereExpression)).toContain(" < ")
    expect(collectSqlValues(outboundWhereExpression)).toContain(
      deliveredReplyAt,
    )
  })

  test("a manual mark-unread issued after the delivery keeps its older value", async () => {
    const manualUnreadAt = new Date("2026-09-23T11:00:00.000Z")
    const deliveredReplyAt = new Date("2026-09-23T12:00:00.000Z")
    returning.mockResolvedValueOnce([{ id: "conv-1" }])
    conversationFindFirst.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: deliveredReplyAt,
      createdAt: new Date("2026-09-22T12:00:00.000Z"),
    })
    findLastByConversation.mockResolvedValue([
      { createdAt: deliveredReplyAt },
      { createdAt: manualUnreadAt },
    ])

    await conversationService.markReadByOutbound({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      inboxId: "inbox-1",
      readAt: deliveredReplyAt,
    })
    await conversationService.markUnread({
      workspaceId: "ws-1",
      id: "conv-1",
    })

    expect(set).toHaveBeenLastCalledWith({
      agentLastReadAt: manualUnreadAt,
    })
  })

  // With a single incoming message, anchoring the cursor on that message would
  // make `lastActivityAt > agentLastReadAt` false and leave the row read.
  // The only value that keeps it unread is "never read".
  test("markUnread on a conversation with one incoming message clears the read cursor", async () => {
    const onlyMessageAt = new Date("2026-09-23T11:00:00.000Z")
    conversationFindFirst.mockResolvedValue({
      id: "conv-1",
      workspaceId: "ws-1",
      contactId: "contact-1",
      lastActivityAt: onlyMessageAt,
      createdAt: new Date("2026-09-22T12:00:00.000Z"),
    })
    findLastByConversation.mockResolvedValue([{ createdAt: onlyMessageAt }])

    const result = await conversationService.markUnread({
      workspaceId: "ws-1",
      id: "conv-1",
    })

    expect(result).toEqual({ agentLastReadAt: null })
    expect(set).toHaveBeenLastCalledWith({ agentLastReadAt: null })
  })
})
