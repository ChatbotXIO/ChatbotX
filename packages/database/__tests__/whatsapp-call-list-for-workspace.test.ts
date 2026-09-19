import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { whatsappCallRepository } from "../src/repositories/whatsapp-call/repository"

/**
 * Renders a drizzle WHERE clause back to readable SQL-ish text (columns,
 * operators and bound values in order) — same technique as
 * `whatsapp-call-repository.test.ts` — so a test can assert the actual
 * predicate reaching Postgres without a live database.
 */
const renderPredicate = (clause: unknown): string => {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child)
      }
      return
    }
    // A plain `sql` tagged-template interpolation (e.g. the cursor's
    // `::timestamptz`-cast bound text) is stored as a bare JS primitive in
    // `queryChunks` until render time — drizzle still parameterises it via
    // `escapeParam` when the query is actually built (see
    // `SQL.buildQueryFromSourceParams`'s fallback branch), it just isn't
    // wrapped in a `Param` object yet at this pre-render stage.
    if (typeof node === "string" || typeof node === "number") {
      parts.push(String(node))
      return
    }
    if (!node || typeof node !== "object") {
      return
    }
    const entry = node as Record<string, unknown>
    if (typeof entry.name === "string" && entry.table) {
      parts.push(`"${entry.name}"`)
      return
    }
    if (Array.isArray(entry.queryChunks)) {
      walk(entry.queryChunks)
      return
    }
    if ("value" in entry) {
      parts.push(String(entry.value))
    }
  }
  walk((clause as { queryChunks?: unknown }).queryChunks)
  return parts.join("").replace(/\s+/g, " ").trim()
}

function createSelectChain() {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
  }
  chain.select.mockReturnValue(chain)
  chain.from.mockReturnValue(chain)
  chain.innerJoin.mockReturnValue(chain)
  chain.leftJoin.mockReturnValue(chain)
  chain.where.mockReturnValue(chain)
  chain.orderBy.mockReturnValue(chain)
  chain.limit.mockResolvedValue([])
  return chain
}

/** Typed cast for a partial mock chain — never `any`, and the double-hop through `unknown` is the standard pattern for a deliberately partial test double. */
const asTx = (chain: ReturnType<typeof createSelectChain>): DatabaseClient =>
  chain as unknown as DatabaseClient

const WORKSPACE_ID = "workspace-1"

describe("whatsappCallRepository.listForWorkspace — where-builder", () => {
  test("allCalls scope adds no own-call restriction", async () => {
    const tx = createSelectChain()

    await whatsappCallRepository.listForWorkspace(
      { workspaceId: WORKSPACE_ID, scope: { allCalls: true }, limit: 25 },
      asTx(tx),
    )

    const predicate = renderPredicate(tx.where.mock.calls[0][0])
    expect(predicate).toContain('"workspaceId"')
    expect(predicate).toContain(WORKSPACE_ID)
    expect(predicate).not.toContain('"answeredByUserId"')
    expect(predicate).not.toContain('"initiatedByUserId"')
  })

  test("own-call scope (contacts) restricts to answered-or-initiated by the member, no conversation restriction", async () => {
    const tx = createSelectChain()

    await whatsappCallRepository.listForWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        scope: { allCalls: false, userId: "user-1", assignedOnly: false },
        limit: 25,
      },
      asTx(tx),
    )

    const predicate = renderPredicate(tx.where.mock.calls[0][0])
    expect(predicate).toContain('"answeredByUserId" = user-1')
    expect(predicate).toContain('"initiatedByUserId" = user-1')
    expect(predicate).not.toContain('"assignedUserId"')
  })

  test("assignedOnly scope (onlyAssignedContacts) ALSO restricts by conversation.assignedUserId", async () => {
    const tx = createSelectChain()

    await whatsappCallRepository.listForWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        scope: { allCalls: false, userId: "user-1", assignedOnly: true },
        limit: 25,
      },
      asTx(tx),
    )

    const predicate = renderPredicate(tx.where.mock.calls[0][0])
    expect(predicate).toContain('"assignedUserId" = user-1')
  })

  test("agentUserId filter is applied only when scope.allCalls is true", async () => {
    const adminTx = createSelectChain()
    await whatsappCallRepository.listForWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        scope: { allCalls: true },
        filters: { agentUserId: "agent-9" },
        limit: 25,
      },
      asTx(adminTx),
    )
    expect(renderPredicate(adminTx.where.mock.calls[0][0])).toContain("agent-9")

    const memberTx = createSelectChain()
    await whatsappCallRepository.listForWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        scope: { allCalls: false, userId: "user-1", assignedOnly: false },
        filters: { agentUserId: "agent-9" },
        limit: 25,
      },
      asTx(memberTx),
    )
    expect(renderPredicate(memberTx.where.mock.calls[0][0])).not.toContain(
      "agent-9",
    )
  })

  test("outcome filter matches the persisted outcome OR a legacy null-outcome row via its status fallback", async () => {
    const tx = createSelectChain()

    await whatsappCallRepository.listForWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        scope: { allCalls: true },
        filters: { outcome: "failed" },
        limit: 25,
      },
      asTx(tx),
    )

    const predicate = renderPredicate(tx.where.mock.calls[0][0])
    expect(predicate).toContain('"outcome" = failed')
    expect(predicate).toContain('"status" = failed')
  })

  test("outcome=canceled has NO legacy status fallback branch (no status value means canceled)", async () => {
    const tx = createSelectChain()

    await whatsappCallRepository.listForWorkspace(
      {
        workspaceId: WORKSPACE_ID,
        scope: { allCalls: true },
        filters: { outcome: "canceled" },
        limit: 25,
      },
      asTx(tx),
    )

    const predicate = renderPredicate(tx.where.mock.calls[0][0])
    expect(predicate).toContain('"outcome" = canceled')
    expect(predicate).not.toContain('"status" = canceled')
  })

  describe("cursor keyset predicate (microsecond precision must survive the round-trip)", () => {
    // The cursor's `createdAt` is bound as its own TEXT value (never
    // a JS `Date`, which only holds millisecond precision) and compared
    // with an explicit `::timestamptz` cast — this exercises the EXACT
    // shape reaching Postgres, not just "the predicate mentions createdAt".
    const CURSOR_CREATED_AT = "2026-01-01 00:00:00.123456+00"

    test("produces createdAt < cursor::timestamptz OR (createdAt = cursor::timestamptz AND id < cursor.id)", async () => {
      const tx = createSelectChain()

      await whatsappCallRepository.listForWorkspace(
        {
          workspaceId: WORKSPACE_ID,
          scope: { allCalls: true },
          cursor: { createdAt: CURSOR_CREATED_AT, id: "call-50" },
          limit: 25,
        },
        asTx(tx),
      )

      const predicate = renderPredicate(tx.where.mock.calls[0][0])
      expect(predicate).toContain(
        `"createdAt" < ${CURSOR_CREATED_AT}::timestamptz`,
      )
      expect(predicate).toContain(
        `"createdAt" = ${CURSOR_CREATED_AT}::timestamptz`,
      )
      expect(predicate).toContain('"id" < call-50')
    })

    test("binds the microsecond-precision cursor text VERBATIM — never a JS Date (which would truncate it)", async () => {
      const tx = createSelectChain()
      // A value a JS `Date` cannot represent losslessly (sub-millisecond
      // digits) — if the implementation ever routed this through
      // `new Date(...)` before binding, this exact string would not survive.
      const microsecondCursor = "2026-01-01 00:00:00.999999+00"

      await whatsappCallRepository.listForWorkspace(
        {
          workspaceId: WORKSPACE_ID,
          scope: { allCalls: true },
          cursor: { createdAt: microsecondCursor, id: "call-50" },
          limit: 25,
        },
        asTx(tx),
      )

      const predicate = renderPredicate(tx.where.mock.calls[0][0])
      expect(predicate).toContain(microsecondCursor)
    })

    test("selects createdAt cast to ::text so the next page's cursor keeps full precision", async () => {
      const tx = createSelectChain()

      await whatsappCallRepository.listForWorkspace(
        { workspaceId: WORKSPACE_ID, scope: { allCalls: true }, limit: 25 },
        asTx(tx),
      )

      const selectArg = tx.select.mock.calls[0][0] as {
        createdAtCursor?: unknown
      }
      expect(renderPredicate(selectArg.createdAtCursor)).toBe(
        '"createdAt"::text',
      )
    })
  })

  test("orders by createdAt desc, id desc (stable tie-break) and requests exactly `limit` rows", async () => {
    const tx = createSelectChain()

    await whatsappCallRepository.listForWorkspace(
      { workspaceId: WORKSPACE_ID, scope: { allCalls: true }, limit: 26 },
      asTx(tx),
    )

    expect(tx.limit).toHaveBeenCalledWith(26)
    const [firstOrderArg, secondOrderArg] = tx.orderBy.mock.calls[0]
    expect(renderPredicate(firstOrderArg)).toBe('"createdAt" desc')
    expect(renderPredicate(secondOrderArg)).toBe('"id" desc')
  })

  test("never joins the sharded Message table", async () => {
    const tx = createSelectChain()

    await whatsappCallRepository.listForWorkspace(
      { workspaceId: WORKSPACE_ID, scope: { allCalls: true }, limit: 25 },
      asTx(tx),
    )

    const drizzleNameSymbol = Symbol.for("drizzle:Name")
    const tableName = (table: unknown): unknown =>
      (table as Record<symbol, unknown>)[drizzleNameSymbol]
    const joinedTableNames = [
      ...tx.innerJoin.mock.calls.map((call) => tableName(call[0])),
      ...tx.leftJoin.mock.calls.map((call) => tableName(call[0])),
    ]
    expect(joinedTableNames).not.toContain("Message")
  })
})
