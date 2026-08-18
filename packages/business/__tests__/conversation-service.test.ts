import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  execute,
  invalidateCacheByTags,
  invalidateTracking,
  set,
  transaction,
  update,
  updateTracking,
  where,
} = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return {
    execute: vi.fn().mockResolvedValue(undefined),
    invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
    invalidateTracking: vi.fn().mockResolvedValue(undefined),
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
  return { ...original, db: { transaction, update, execute } }
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
        typeof obj.value !== "object"
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
