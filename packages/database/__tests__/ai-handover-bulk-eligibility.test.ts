import { and } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import {
  type BulkEligibilityInput,
  bulkEligibilityConditions,
  bulkEligibilityWhere,
} from "../src/queries/ai-handover-bulk-eligibility"
import { contactInboxRepository } from "../src/repositories/contact-inbox/repository"

const dialect = new PgDialect()
const NOW = new Date("2026-10-02T12:00:00.000Z")
const REQUESTED_AT = new Date("2026-10-02T11:00:00.000Z")
const SINCE = new Date("2026-09-25T12:00:00.000Z")

const input = (overrides: Partial<BulkEligibilityInput> = {}) => ({
  action: "disable" as const,
  requestedAt: REQUESTED_AT,
  now: NOW,
  lastIncomingSince: SINCE,
  ...overrides,
})

const render = (overrides: Partial<BulkEligibilityInput> = {}) =>
  dialect.sqlToQuery(
    and(...bulkEligibilityConditions(input(overrides))) as never,
  )

describe("bulkEligibilityConditions", () => {
  test("disable targets only threads the AI agent holds right now", () => {
    const { sql, params } = render()

    expect(sql).toContain('"threadControlState" = $')
    expect(sql).toContain('"threadOwnerRole" = $')
    expect(params).toEqual(expect.arrayContaining(["standby", "ai_agent"]))
    // The resolved (expiry / 24h idle) form of standby, not the raw column.
    expect(sql).toContain('"threadOwnerExpiresAt" IS NOT NULL')
    expect(sql).toContain("GREATEST")
    expect(sql).not.toContain("NOT (")
  })

  test("enable excludes held standby and is never limited to the AI role", () => {
    const { sql, params } = render({ action: "enable" })

    expect(sql).toContain("NOT COALESCE(")
    expect(params).not.toContain("ai_agent")
  })

  test.each([
    "enable",
    "disable",
  ] as const)("%s respects the request cut-off and accepts never-observed threads", (action) => {
    const { sql, params } = render({ action })

    expect(sql).toContain('"threadControlUpdatedAt" is null')
    expect(sql).toContain('"threadControlUpdatedAt" <= $')
    // Column comparisons are encoded to ISO strings by drizzle.
    expect(params).toContain(REQUESTED_AT.toISOString())
  })

  test.each([
    "enable",
    "disable",
  ] as const)("%s requires an address and activity inside the window", (action) => {
    const { sql, params } = render({ action })

    expect(sql).toContain('"sourceId" is not null')
    expect(sql).toContain('"lastIncomingMessageAt" >= $')
    expect(params).toContain(SINCE.toISOString())
  })

  test("the idle boundary is computed from `now`, not the database clock", () => {
    const { params } = render()

    expect(params).toContainEqual(new Date(NOW.getTime() - 24 * 60 * 60 * 1000))
  })
})

describe("bulkEligibilityWhere", () => {
  test("scopes to the inbox and resumes after the cursor", () => {
    const withCursor = dialect.sqlToQuery(
      bulkEligibilityWhere("inbox-1", input(), "ci-9") as never,
    )
    const fresh = dialect.sqlToQuery(
      bulkEligibilityWhere("inbox-1", input(), null) as never,
    )

    expect(withCursor.params).toEqual(
      expect.arrayContaining(["inbox-1", "ci-9"]),
    )
    expect(withCursor.sql).toContain('"ContactInbox"."id" > $')
    expect(fresh.sql).not.toContain('"ContactInbox"."id" > $')
  })
})

describe("contactInboxRepository bulk queries", () => {
  const selectTx = (rows: unknown[]) => {
    const limit = vi.fn().mockResolvedValue(rows)
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const innerJoin = vi.fn().mockReturnValue({ where })
    const from = vi.fn().mockReturnValue({ innerJoin })
    const select = vi.fn().mockReturnValue({ from })
    return {
      tx: { select } as unknown as DatabaseClient,
      innerJoin,
      orderBy,
      limit,
      where,
    }
  }

  test("a page joins the direct-message conversation of the workspace and is id-ordered", async () => {
    const rows = [{ id: "ci-1", conversationId: "conv-1" }]
    const { tx, innerJoin, limit } = selectTx(rows)

    const page = await contactInboxRepository.listBulkAiPage(
      {
        ...input(),
        workspaceId: "ws-1",
        inboxId: "inbox-1",
        afterId: null,
        limit: 50,
      },
      tx,
    )

    expect(page).toBe(rows)
    expect(limit).toHaveBeenCalledWith(50)
    const join = dialect.sqlToQuery(innerJoin.mock.calls[0][1])
    expect(join.sql).toContain('"sourceId" is null')
    expect(join.params).toContain("ws-1")
  })

  test("the pre-dispatch re-check makes no query for an empty batch", async () => {
    const select = vi.fn()

    const ids = await contactInboxRepository.listStillBulkAiEligible(
      { ...input(), workspaceId: "ws-1", ids: [] },
      { select } as unknown as DatabaseClient,
    )

    expect(ids).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })
})
