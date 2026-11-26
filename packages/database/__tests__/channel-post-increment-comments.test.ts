import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import { channelPostRepository } from "../src/repositories/channel-post/repository"

const dialect = new PgDialect()

const run = async () => {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn().mockReturnValue({ where })
  const update = vi.fn().mockReturnValue({ set })
  const tx = { update } as unknown as DatabaseClient

  await channelPostRepository.incrementCommentsCount(
    { id: "7", workspaceId: "ws-1" },
    tx,
  )

  const assignments = set.mock.calls[0]?.[0] as Record<string, unknown>
  return {
    update,
    set: Object.fromEntries(
      Object.entries(assignments).map(([column, value]) => [
        column,
        dialect.sqlToQuery(value as never),
      ]),
    ),
    where: dialect.sqlToQuery(where.mock.calls[0]?.[0]),
  }
}

describe("channelPostRepository.incrementCommentsCount", () => {
  test("one statement raises the comments, the engagement total and the known bit together", async () => {
    const { set, update } = await run()

    expect(update).toHaveBeenCalledTimes(1)
    expect(set.commentsCount?.sql).toBe('"ChannelPost"."commentsCount" + 1')
    expect(set.engagementCount?.sql).toBe('"ChannelPost"."engagementCount" + 1')
    // An unknown count (stored as 0) becomes a known one.
    expect(set.metricsKnownMask?.sql).toContain('"metricsKnownMask" | ')
    expect(set.metricsKnownMask?.params).toEqual([9])
  })

  test("is scoped to the post and its workspace", async () => {
    const { where } = await run()

    expect(where.sql).toContain('"ChannelPost"."id" = $1')
    expect(where.sql).toContain('"ChannelPost"."workspaceId" = $2')
    expect(where.params).toEqual(["7", "ws-1"])
  })
})
