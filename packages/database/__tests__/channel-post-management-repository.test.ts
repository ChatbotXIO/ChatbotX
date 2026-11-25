import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import type { ChannelPostManagementSort } from "../src/partials/channel-post"
import {
  type ChannelPostManagementCursor,
  type ChannelPostManagementFilters,
  channelPostManagementRepository,
} from "../src/repositories/channel-post/management"

const dialect = new PgDialect()

const buildListTx = () => {
  const limit = vi.fn().mockResolvedValue([])
  const orderBy = vi.fn().mockReturnValue({ limit })
  const where = vi.fn().mockReturnValue({ orderBy })
  const innerJoin = vi.fn().mockReturnValue({ where })
  const from = vi.fn().mockReturnValue({ innerJoin })
  const select = vi.fn().mockReturnValue({ from })
  return {
    limit,
    orderBy,
    tx: { select } as unknown as DatabaseClient,
    where,
  }
}

const runList = async (input: {
  cursor?: ChannelPostManagementCursor
  filters?: Partial<ChannelPostManagementFilters>
  sort: ChannelPostManagementSort
}) => {
  const { limit, orderBy, tx, where } = buildListTx()
  await channelPostManagementRepository.list(
    {
      cursor: input.cursor,
      filters: { hasComments: false, ...input.filters },
      limit: 31,
      sort: input.sort,
      workspaceId: "ws-1",
    },
    tx,
  )
  return {
    limit,
    orderBy: dialect.sqlToQuery(orderBy.mock.calls[0][0]),
    where: dialect.sqlToQuery(where.mock.calls[0][0]),
  }
}

describe("channelPostManagementRepository.list", () => {
  test("always scopes to the workspace and hides removed posts", async () => {
    const { where } = await runList({ sort: "newest" })

    expect(where.sql).toContain('"ChannelPost"."workspaceId" = $1')
    expect(where.sql).toContain('"ChannelPost"."removedAt" is null')
    expect(where.params).toEqual(["ws-1"])
  })

  test("newest pages by (sort key, id) descending with a timestamp cursor", async () => {
    const { orderBy, where } = await runList({
      cursor: {
        id: "42",
        sort: "newest",
        sortValue: "2026-11-22 14:04:24.123456+00",
      },
      sort: "newest",
    })

    expect(where.sql).toContain(
      'COALESCE("ChannelPost"."publishedAt", "ChannelPost"."createdAt"), "ChannelPost"."id") < ($2::timestamptz, $3::bigint)',
    )
    expect(where.params).toEqual([
      "ws-1",
      "2026-11-22 14:04:24.123456+00",
      "42",
    ])
    expect(orderBy.sql).toContain('DESC, "ChannelPost"."id" DESC NULLS LAST')
  })

  test("a count sort pages with a bigint cursor and the matching index order", async () => {
    const most = await runList({
      cursor: { id: "9", sort: "mostComments", sortValue: "12" },
      sort: "mostComments",
    })
    const fewest = await runList({
      cursor: { id: "9", sort: "fewestComments", sortValue: "12" },
      sort: "fewestComments",
    })

    expect(most.where.sql).toContain(
      '("ChannelPost"."commentsCount", "ChannelPost"."id") < ($2::bigint, $3::bigint)',
    )
    expect(most.orderBy.sql).toBe(
      '"ChannelPost"."commentsCount" DESC NULLS LAST, "ChannelPost"."id" DESC NULLS LAST',
    )
    expect(fewest.where.sql).toContain(
      '("ChannelPost"."commentsCount", "ChannelPost"."id") > ($2::bigint, $3::bigint)',
    )
    expect(fewest.orderBy.sql).toBe(
      '"ChannelPost"."commentsCount" ASC NULLS FIRST, "ChannelPost"."id" ASC NULLS FIRST',
    )
  })

  test.each([
    ["mostPhones", "phoneCommentsCount"],
    ["mostEngagement", "engagementCount"],
    ["mostShares", "sharesCount"],
  ] as const)("%s orders by %s", async (sort, column) => {
    const { orderBy } = await runList({ sort })

    expect(orderBy.sql).toContain(`"ChannelPost"."${column}" DESC NULLS LAST`)
  })

  test("without a cursor adds no keyset comparison", async () => {
    const { where } = await runList({ sort: "mostComments" })

    expect(where.sql).not.toContain("::bigint")
  })

  test("hasComments keeps posts with comments or not yet measured", async () => {
    const { where } = await runList({
      filters: { hasComments: true },
      sort: "newest",
    })

    expect(where.sql).toContain('"ChannelPost"."commentsCount" > $2')
    expect(where.sql).toContain('"ChannelPost"."metricsFetchedAt" is null')
    expect(where.sql).toContain('commentsCount" > $2) or')
  })

  test("hasComments keeps a post whose comment count is unknown but has a recorded commenter", async () => {
    const { where } = await runList({
      filters: { hasComments: true },
      sort: "newest",
    })

    expect(where.sql).toContain('"ChannelPost"."metricsKnownMask" &')
    expect(where.sql).toContain('from "ContactInboxPost"')
    expect(where.sql).toContain(
      '"ContactInboxPost"."workspaceId" = "ChannelPost"."workspaceId"',
    )
    expect(where.sql).toContain(
      '"ContactInboxPost"."postId" = "ChannelPost"."id"',
    )
  })

  test("sends every filter value as a bound parameter, never inline", async () => {
    const hostile = 'x\'; DROP TABLE "ChannelPost"; --'
    const { where } = await runList({
      filters: {
        channels: ["messenger"],
        inboxIds: ["7"],
        search: hostile,
        topicIds: ["3"],
      },
      sort: "newest",
    })

    expect(where.sql).not.toContain("DROP TABLE")
    expect(where.params).toContain(`%${hostile}%`)
    expect(where.params).toContain(hostile)
    expect(where.sql).toContain('"ChannelPost"."channel" in ($2)')
    expect(where.sql).toContain('"ChannelPost"."inboxId" in ($3)')
    expect(where.sql).toContain('"ChannelPostToPostTopic"."postTopicId" in')
  })

  test("escapes LIKE wildcards in the search text", async () => {
    const { where } = await runList({
      filters: { search: "50%_off" },
      sort: "newest",
    })

    expect(where.params).toContain("%50\\%\\_off%")
  })

  test("forwards the page size to the query", async () => {
    const { limit } = await runList({ sort: "newest" })

    expect(limit).toHaveBeenCalledWith(31)
  })
})

describe("channelPostManagementRepository switch filters", () => {
  test("filters on each switch only when it is given, with bound values", async () => {
    const { where } = await runList({
      filters: {
        hideComments: true,
        hidePhoneComments: false,
        skipComments: true,
      },
      sort: "newest",
    })

    expect(where.sql).toContain('"ChannelPost"."hideComments" = $2')
    expect(where.sql).toContain('"ChannelPost"."hidePhoneComments" = $3')
    expect(where.sql).toContain('"ChannelPost"."skipComments" = $4')
    expect(where.params).toEqual(["ws-1", true, false, true])
  })

  test("leaves the switches unfiltered when none is given", async () => {
    const { where } = await runList({ sort: "newest" })

    expect(where.sql).not.toContain("hideComments")
    expect(where.sql).not.toContain("skipComments")
  })
})

describe("channelPostManagementRepository.updateSettings", () => {
  const buildUpdateTx = () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn().mockReturnValue({ where })
    const update = vi.fn().mockReturnValue({ set })
    return { set, tx: { update } as unknown as DatabaseClient, update, where }
  }

  test("sets only the given switches on live posts of the workspace", async () => {
    const { set, tx, where } = buildUpdateTx()

    await channelPostManagementRepository.updateSettings(
      {
        ids: ["1", "2"],
        patch: { hideComments: true, skipComments: undefined },
        workspaceId: "ws-1",
      },
      tx,
    )

    expect(set).toHaveBeenCalledWith({
      hideComments: true,
      skipComments: undefined,
      updatedAt: expect.any(Date),
    })
    const condition = dialect.sqlToQuery(where.mock.calls[0][0])
    expect(condition.sql).toContain('"ChannelPost"."workspaceId" = $1')
    expect(condition.sql).toContain('"ChannelPost"."removedAt" is null')
    expect(condition.sql).toContain('"ChannelPost"."id" in ($2, $3)')
  })

  test.each([
    ["no posts", { ids: [], patch: { hideComments: true } }],
    ["an empty patch", { ids: ["1"], patch: {} }],
    [
      "only undefined values",
      { ids: ["1"], patch: { skipComments: undefined } },
    ],
  ])("writes nothing for %s", async (_label, input) => {
    const { tx, update } = buildUpdateTx()

    await channelPostManagementRepository.updateSettings(
      { ...input, workspaceId: "ws-1" },
      tx,
    )

    expect(update).not.toHaveBeenCalled()
  })
})

describe("channelPostManagementRepository.findExistingIds", () => {
  test("skips the query for an empty id list", async () => {
    const select = vi.fn()

    const ids = await channelPostManagementRepository.findExistingIds(
      { ids: [], workspaceId: "ws-1" },
      { select } as unknown as DatabaseClient,
    )

    expect(ids).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })
})

describe("channelPostManagementRepository.lockExistingIds", () => {
  const buildLockTx = () => {
    const forUpdate = vi.fn().mockResolvedValue([{ id: "1" }])
    const orderBy = vi.fn().mockReturnValue({ for: forUpdate })
    const where = vi.fn().mockReturnValue({ orderBy })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    return {
      forUpdate,
      orderBy,
      select,
      tx: { select } as unknown as DatabaseClient,
      where,
    }
  }

  test("locks the workspace's live posts in id order", async () => {
    const { forUpdate, orderBy, tx, where } = buildLockTx()

    const ids = await channelPostManagementRepository.lockExistingIds(
      { ids: ["2", "1"], workspaceId: "ws-1" },
      tx,
    )

    const condition = dialect.sqlToQuery(where.mock.calls[0][0])
    expect(ids).toEqual(["1"])
    expect(condition.sql).toContain('"ChannelPost"."workspaceId" = $1')
    expect(condition.sql).toContain('"ChannelPost"."removedAt" is null')
    expect(dialect.sqlToQuery(orderBy.mock.calls[0][0]).sql).toContain(
      '"ChannelPost"."id" asc',
    )
    expect(forUpdate).toHaveBeenCalledWith("update")
  })

  test("skips the query for an empty id list", async () => {
    const { select, tx } = buildLockTx()

    const ids = await channelPostManagementRepository.lockExistingIds(
      { ids: [], workspaceId: "ws-1" },
      tx,
    )

    expect(ids).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })
})
