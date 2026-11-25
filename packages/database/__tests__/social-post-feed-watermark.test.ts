// @vitest-environment node

import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"

const calls = {
  set: vi.fn(),
  where: vi.fn(),
}
const rows: { newest: Date | null }[] = []
const tx = {
  select: () => ({
    from: () => ({
      where: (condition: unknown) => {
        calls.where(condition)
        return Promise.resolve(rows)
      },
    }),
  }),
  update: () => ({
    set: (values: unknown) => {
      calls.set(values)
      return {
        where: () => ({ returning: () => Promise.resolve([{ id: "f-1" }]) }),
      }
    },
  }),
}

const { socialPostFeedRepository } = await import(
  "../src/repositories/social-post-feed/repository"
)
const dialect = new PgDialect()
const scope = {
  notAfter: new Date("2026-11-24T00:00:00Z"),
  since: new Date("2026-11-01T00:00:00Z"),
  workspaceId: "ws-1",
}

describe("socialPostFeedRepository.maxPublishedAt", () => {
  test("is the newest date the ledger of that feed has, or null", async () => {
    const newest = new Date("2026-11-20T10:00:00Z")
    rows.splice(0, rows.length, { newest })
    expect(
      await socialPostFeedRepository.maxPublishedAt(
        { ...scope, feedId: "f-1" },
        tx as never,
      ),
    ).toEqual(newest)

    rows.splice(0, rows.length, { newest: null })
    expect(
      await socialPostFeedRepository.maxPublishedAt(
        { ...scope, feedId: "f-1" },
        tx as never,
      ),
    ).toBeNull()

    rows.splice(0, rows.length)
    expect(
      await socialPostFeedRepository.maxPublishedAt(
        { ...scope, feedId: "f-1" },
        tx as never,
      ),
    ).toBeNull()
  })

  test("is scoped to the feed id (served by the feedId index)", async () => {
    rows.splice(0, rows.length, { newest: null })
    await socialPostFeedRepository.maxPublishedAt(
      { ...scope, feedId: "f-9" },
      tx as never,
    )

    const { sql, params } = dialect.sqlToQuery(
      calls.where.mock.calls.at(-1)?.[0],
    )
    expect(sql).toContain('"feedId"')
    expect(params).toContain("f-9")
    // Workspace-scoped, only this address's history, and no future date.
    expect(sql).toContain('"workspaceId"')
    expect(params).toContain("ws-1")
    expect(sql).toContain('"createdAt" >=')
    expect(sql).toContain('"publishedAt" <=')
  })
})

describe("socialPostFeedRepository.finishRun", () => {
  test("stores the summary and moves nextCheckAt only when asked", async () => {
    const summary = {
      created: 0,
      fresh: 0,
      items: 3,
      kind: "stale" as const,
      refused: 0,
      staleRetries: 1,
      waiting: 0,
    }
    const base = {
      consecutiveFailures: 0,
      etag: null,
      lastErrorCode: null,
      lastModified: null,
      primedAt: null,
      status: "active" as const,
      summary,
    }
    const soon = new Date("2026-11-24T10:02:00Z")
    await socialPostFeedRepository.finishRun(
      {
        id: "f-1",
        leaseUntil: new Date(),
        now: new Date(),
        result: { ...base, nextCheckAt: soon },
        workspaceId: "ws",
      },
      tx as never,
    )
    await socialPostFeedRepository.finishRun(
      {
        id: "f-1",
        leaseUntil: new Date(),
        now: new Date(),
        result: base,
        workspaceId: "ws",
      },
      tx as never,
    )

    const [first, second] = calls.set.mock.calls.map(
      ([values]) => values as Record<string, unknown>,
    )
    expect(first).toMatchObject({ lastRunSummary: summary, nextCheckAt: soon })
    expect(second).toMatchObject({ lastRunSummary: summary })
    expect(second).not.toHaveProperty("nextCheckAt")
  })
})
