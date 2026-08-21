import { beforeEach, describe, expect, test, vi } from "vitest"

// Real `and`/`eq`/`sql` from drizzle so the WHERE clause built by
// `consumeChallenge` is a genuine parameterized SQL AST — this test asserts
// on that AST directly (bound param values + literal text) rather than on a
// stubbed builder, so a regression to string concatenation or a dropped
// predicate would show up here.
const { returningMock, whereMock, setMock, updateMock } = vi.hoisted(() => {
  const returningMock = vi.fn()
  const whereMock = vi.fn(() => ({ returning: returningMock }))
  const setMock = vi.fn(() => ({ where: whereMock }))
  const updateMock = vi.fn(() => ({ set: setMock }))
  return { returningMock, whereMock, setMock, updateMock }
})

vi.mock("@chatbotx.io/database/client", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@chatbotx.io/database/client")>()
  return { ...original, db: { update: updateMock } }
})

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
  invalidateCacheByTags: vi.fn(),
  createRedisConnection: vi.fn(() => ({ on: vi.fn() })),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitConversationArchived: vi.fn(),
  emitConversationAssigned: vi.fn(),
  emitConversationFollowUp: vi.fn(),
  emitConversationTransferredToBot: vi.fn(),
  emitConversationTransferredToHuman: vi.fn(),
  emitConversationUnassigned: vi.fn(),
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: {},
}))

const { conversationService } = await import("../src/conversation/service")

/**
 * Shared recursive, WeakSet-guarded traversal of a Drizzle SQL object tree.
 * Mirrors the walker in `conversation-service.test.ts` — duplicated locally
 * so this file's mocks stay fully isolated from that file's shared harness
 * (which doesn't support a `.returning()` chain).
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

function collectSqlValues(node: unknown): unknown[] {
  const out: unknown[] = []
  walkSqlNode(node, (n) => {
    if (n === null || typeof n !== "object" || Array.isArray(n)) {
      return
    }
    const obj = n as Record<string, unknown>
    if ("value" in obj && obj.value !== null && typeof obj.value !== "object") {
      out.push(obj.value)
    }
  })
  return out
}

function collectSqlText(node: unknown): string {
  const out: string[] = []
  walkSqlNode(node, (n) => {
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
  })
  return out.join("")
}

// `collectSqlValues` above only finds values Drizzle wraps as `{ value }`
// nodes (e.g. via `eq()`/`Param`). Raw ``sql`...${x}...``` template literals
// (used by `consumeChallenge`'s jsonb path predicates) embed interpolated
// values directly in `queryChunks`, skipping only the literal-text
// `StringChunk` nodes. This walks those raw params instead.
function collectSqlParams(node: unknown): unknown[] {
  const out: unknown[] = []
  walkSqlNode(node, (n) => {
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
  })
  return out
}

beforeEach(() => {
  updateMock.mockClear()
  setMock.mockClear()
  whereMock.mockClear()
  returningMock.mockReset()
})

describe("conversationService.consumeChallenge", () => {
  test("clears the challenge and returns true when a row is claimed", async () => {
    returningMock.mockResolvedValueOnce([{ id: "conv-1" }])

    const claimed = await conversationService.consumeChallenge({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "challenge-1",
    })

    expect(claimed).toBe(true)
    expect(setMock).toHaveBeenCalledTimes(1)
    expect(returningMock).toHaveBeenCalledWith({ id: expect.anything() })
  })

  test("returns false (no claim) when zero rows match", async () => {
    returningMock.mockResolvedValueOnce([])

    const claimed = await conversationService.consumeChallenge({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "wrong-challenge",
    })

    expect(claimed).toBe(false)
  })

  test("scopes the WHERE clause by id, workspaceId, stepId AND challengeId as bound parameters", async () => {
    returningMock.mockResolvedValueOnce([{ id: "conv-1" }])

    await conversationService.consumeChallenge({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      stepId: "step-1",
      challengeId: "challenge-1",
    })

    expect(whereMock).toHaveBeenCalledTimes(1)
    const whereArg = whereMock.mock.calls[0]?.[0]

    // The id/workspaceId equality predicates go through eq() (Param-wrapped
    // bindings); the jsonb stepId/challengeId predicates are raw `sql`
    // template interpolations. All four scoping values must be bound SQL
    // parameters, not interpolated into the query text (which would open a
    // SQL-injection surface).
    const eqValues = collectSqlValues(whereArg)
    expect(eqValues).toContain("conv-1")
    expect(eqValues).toContain("ws-1")

    const rawParams = collectSqlParams(whereArg)
    expect(rawParams).toContain("step-1")
    expect(rawParams).toContain("challenge-1")

    const text = collectSqlText(whereArg)
    expect(text).toContain("stepId")
    expect(text).toContain("challengeId")
  })

  test("does not clear the challenge (no matching row) when the challengeId differs", async () => {
    // The mock builder can't simulate the real predicate not matching a row —
    // that's covered by the WHERE-clause assertion above (the challengeId is
    // bound into the predicate). This test documents the contract: a
    // returning() result of zero rows (e.g. because Postgres found no row
    // whose stepId+challengeId matched) must surface as `false`, never throw.
    returningMock.mockResolvedValueOnce([])

    await expect(
      conversationService.consumeChallenge({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        stepId: "step-1",
        challengeId: "stale-challenge",
      }),
    ).resolves.toBe(false)
  })
})

describe("conversationService.restoreChallengeIfAbsent", () => {
  const challenge = {
    type: "step" as const,
    data: {
      flowId: "flow-1",
      nodeId: "node-1",
      stepId: "step-1",
      attempts: 1,
      lastAttemptAt: new Date("2026-08-21T00:00:00.000Z"),
      challengeId: "challenge-1",
    },
  }

  test("returns true when the conditional write claims a row", async () => {
    returningMock.mockResolvedValueOnce([{ id: "conv-1" }])

    await expect(
      conversationService.restoreChallengeIfAbsent({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        challenge,
      }),
    ).resolves.toBe(true)
  })

  test("returns false when a challenge already exists (predicate excludes the row)", async () => {
    returningMock.mockResolvedValueOnce([])

    await expect(
      conversationService.restoreChallengeIfAbsent({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        challenge,
      }),
    ).resolves.toBe(false)
  })

  test("guards the write with an absence predicate and binds scoping values as parameters", async () => {
    returningMock.mockResolvedValueOnce([{ id: "conv-1" }])

    await conversationService.restoreChallengeIfAbsent({
      workspaceId: "ws-1",
      conversationId: "conv-1",
      challenge,
    })

    expect(whereMock).toHaveBeenCalledTimes(1)
    const whereArg = whereMock.mock.calls[0]?.[0]

    const eqValues = collectSqlValues(whereArg)
    expect(eqValues).toContain("conv-1")
    expect(eqValues).toContain("ws-1")

    // The restore may only land while no challenge exists on the row.
    const text = collectSqlText(whereArg)
    expect(text).toContain("jsonb_exists")
    expect(text).toContain("IS NULL")
  })
})
