// @vitest-environment node

import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"

const set = vi.fn()
const tx = {
  update: () => ({
    set: (values: unknown) => {
      set(values)
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
const RESET_KEYS = [
  "consecutiveFailures",
  "etag",
  "lastErrorCode",
  "lastModified",
  "leaseExpiresAt",
  "primedAt",
  "startedAt",
]

describe("socialPostFeedRepository.update address change", () => {
  test("resets validators, priming and the running check's lease in the same statement, only when the address differs", async () => {
    await socialPostFeedRepository.update(
      {
        id: "f-1",
        patch: { feedUrl: "https://example.com/new.xml" },
        workspaceId: "ws-1",
      },
      tx as never,
    )

    const values = set.mock.calls[0]?.[0] as Record<string, never>
    for (const key of RESET_KEYS) {
      const { sql } = dialect.sqlToQuery(values[key])
      expect(sql).toContain("IS DISTINCT FROM")
      expect(sql).toContain("CASE WHEN")
    }
  })

  test("leaves the stored state alone when the patch has no address", async () => {
    set.mockClear()
    await socialPostFeedRepository.update(
      { id: "f-1", patch: { name: "Renamed" }, workspaceId: "ws-1" },
      tx as never,
    )

    const values = set.mock.calls[0]?.[0] as Record<string, unknown>
    for (const key of RESET_KEYS) {
      expect(values).not.toHaveProperty(key)
    }
    expect(values).not.toHaveProperty("nextCheckAt")
  })
})

describe("socialPostFeedRepository.update schedule", () => {
  const nextCheckSql = async (patch: Record<string, unknown>) => {
    set.mockClear()
    await socialPostFeedRepository.update(
      { id: "f-1", patch, workspaceId: "ws-1" },
      tx as never,
    )
    const values = set.mock.calls[0]?.[0] as Record<string, never>
    return dialect.sqlToQuery(values.nextCheckAt)
  }

  test("a new address is checked at once", async () => {
    const { sql } = await nextCheckSql({ feedUrl: "https://example.com/n.xml" })
    expect(sql).toContain("IS DISTINCT FROM")
    expect(sql).toContain("THEN now()")
  })

  test("a shorter interval pulls a far-away check forward", async () => {
    const { params, sql } = await nextCheckSql({ intervalMinutes: 15 })
    expect(sql).toContain("LEAST(")
    expect(sql).toContain("make_interval(mins =>")
    expect(params).toContain(15)
  })
})
