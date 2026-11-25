import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ShardedMessageRepository } from "../src/sharding/message/repository/sharded-message-repository"

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn((_key: string, factory: () => unknown) => factory()),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
  distributedLock: { runExclusive: vi.fn() },
}))

const dialect = new PgDialect()

const shardInfo = (id: string) => ({
  id: `tr:${id}`,
  shardId: id,
  startTime: new Date(0),
  endTime: null,
  shard: {
    id,
    name: id,
    host: "localhost",
    port: 5432,
    database: "shard_db",
    user: "shard_user",
  },
})

type Row = { createdAt: Date; createdAtText: string; id: string }

const row = (id: string, text: string): Row => ({
  createdAt: new Date(text),
  createdAtText: text,
  id,
})

/** A shard client whose select chain answers with `rows` and records its clauses. */
const makeClient = (rows: Row[]) => {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  return { chain, select: vi.fn().mockReturnValue(chain) }
}

const buildRepository = (
  clients: Record<string, ReturnType<typeof makeClient>>,
) => {
  const ids = Object.keys(clients)
  const shards = ids.map(shardInfo)
  const shardManager = {
    getShardsForTimeRange: vi.fn().mockResolvedValue(shards),
    getWriteShardInfo: vi.fn().mockResolvedValue(null),
    withShardClientForRead: vi.fn(
      (shard: { id: string }, run: (client: unknown) => Promise<unknown>) =>
        run(clients[shard.id]),
    ),
  }
  return {
    repository: new ShardedMessageRepository(shardManager as never),
    shardManager,
  }
}

const query = (overrides: Record<string, unknown> = {}) => ({
  filter: { contactInboxIds: ["ci1"], conversationIds: ["c1", "c2"] },
  pagination: { limit: 2 },
  workspaceId: "ws-1",
  ...overrides,
})

describe("ShardedMessageRepository.listComments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("reads only the comments of the given conversations, not removed, in the workspace", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })

    await repository.listComments(query() as never)

    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).toContain('"Message"."workspaceId" = $1')
    expect(where.sql).toContain(
      '"Message"."conversationId" = ANY($2::bigint[])',
    )
    expect(where.sql).toContain(
      '"Message"."contactInboxId" = ANY($3::bigint[])',
    )
    expect(where.sql).toContain(`"Message"."type" = 'comment'`)
    expect(where.sql).toContain('"Message"."deletedAt" IS NULL')
    expect(where.params).toEqual(["ws-1", ["c1", "c2"], ["ci1"]])
  })

  test("reads only the comments of the given contact inboxes, and nothing without any", async () => {
    const client = makeClient([row("1", "2026-11-22 10:00:00.123456+00")])
    const { repository } = buildRepository({ a: client })

    const page = await repository.listComments(
      query({
        filter: { contactInboxIds: [], conversationIds: ["c1"] },
      }) as never,
    )

    expect(client.select).not.toHaveBeenCalled()
    expect(page.data).toEqual([])
  })

  test("a read over a hundred thousand threads still binds one array parameter", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })
    const conversationIds = Array.from({ length: 100_000 }, (_, index) =>
      String(index + 1),
    )

    await repository.listComments(
      query({
        filter: {
          contactInboxIds: conversationIds,
          conversationIds,
          hasPhone: true,
        },
      }) as never,
    )

    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    // workspace, the two id arrays and the phone pattern: far below the
    // protocol's 65,535 binds however many ids there are.
    expect(where.params).toHaveLength(4)
    expect(where.params[1]).toHaveLength(100_000)
    expect(where.params[2]).toHaveLength(100_000)
  })

  test("orders newest first with the id as the tie-break and over-fetches one row", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })

    await repository.listComments(query() as never)

    const order = dialect.sqlToQuery(client.chain.orderBy.mock.calls[0][0])
    expect(order.sql).toContain('"Message"."createdAt" desc')
    expect(client.chain.limit).toHaveBeenCalledWith(3)
  })

  test("hasPhone filters by the shared phone pattern, bound as a parameter", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })

    await repository.listComments(
      query({
        filter: {
          contactInboxIds: ["ci1"],
          conversationIds: ["c1"],
          hasPhone: true,
        },
      }) as never,
    )

    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).toContain('"Message"."text" ~ $')
    expect(where.params).toContain("[0-9][0-9[:space:]().-]{7,}")
  })

  test("search is a case-insensitive contains with LIKE wildcards escaped", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })

    await repository.listComments(
      query({
        filter: {
          contactInboxIds: ["ci1"],
          conversationIds: ["c1"],
          search: "50%_off\\",
        },
      }) as never,
    )

    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).toContain("ILIKE")
    expect(where.sql).toContain("ESCAPE")
    expect(where.params).toContain("%50\\%\\_off\\\\%")
    // Without `redactPhones` the stored text is searched as it is.
    expect(where.sql).not.toContain("regexp_replace")
  })

  test("a viewer without phone permission searches the text with numbers masked", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })

    await repository.listComments(
      query({
        filter: {
          contactInboxIds: ["ci1"],
          conversationIds: ["c1"],
          redactPhones: true,
          search: "09 01 23 45 67",
        },
      }) as never,
    )

    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).toContain(
      `regexp_replace("Message"."text", $4, '•••', 'g') ILIKE $5`,
    )
    // Both the pattern and the search are bound, never spliced into the SQL.
    expect(where.params[3]).toBe("\\+?[0-9][0-9[:space:]().-]{7,}")
    expect(where.params[4]).toBe("%09 01 23 45 67%")
    expect(where.sql).not.toContain("09 01")
  })

  test("redaction does nothing when there is no search", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })

    await repository.listComments(
      query({
        filter: {
          contactInboxIds: ["ci1"],
          conversationIds: ["c1"],
          redactPhones: true,
        },
      }) as never,
    )

    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).not.toContain("regexp_replace")
  })

  test("an empty conversation list reads nothing", async () => {
    const client = makeClient([row("1", "2026-11-22 10:00:00.123456+00")])
    const { repository } = buildRepository({ a: client })

    const page = await repository.listComments(
      query({ filter: { conversationIds: [] } }) as never,
    )

    expect(client.select).not.toHaveBeenCalled()
    expect(page.data).toEqual([])
    expect(page.nextCursor).toBeNull()
  })

  test("a full page returns a cursor with the exact microsecond text", async () => {
    const client = makeClient([
      row("9", "2026-11-22 10:00:00.123456+00"),
      row("8", "2026-11-22 10:00:00.123400+00"),
      row("7", "2026-11-22 09:59:59.000001+00"),
    ])
    const { repository } = buildRepository({ a: client })

    const page = await repository.listComments(query() as never)

    expect(page.data.map((comment) => comment.id)).toEqual(["9", "8"])
    expect(page.nextCursor).toMatchObject({
      createdAtText: "2026-11-22 10:00:00.123400+00",
      id: "8",
      shardId: "a",
    })
  })

  test("the cursor compares the exact timestamp text, not a rounded Date", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })

    await repository.listComments(
      query({
        pagination: {
          cursor: {
            createdAt: new Date("2026-11-22T10:00:00.123Z"),
            createdAtText: "2026-11-22 10:00:00.123456+00",
            id: "8",
          },
          limit: 2,
        },
      }) as never,
    )

    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).toContain('"Message"."createdAt" < $')
    expect(where.sql).toContain('"Message"."createdAt" = $')
    expect(where.sql).toContain('"Message"."id" < $')
    expect(where.params).toContain("2026-11-22 10:00:00.123456+00")
    expect(where.params).toContain("8")
  })

  test("walks the shards newest first and carries the page across them", async () => {
    const newest = makeClient([row("5", "2026-11-22 10:00:00.000000+00")])
    const older = makeClient([
      row("4", "2026-11-21 10:00:00.000000+00"),
      row("3", "2026-11-20 10:00:00.000000+00"),
    ])
    const { repository } = buildRepository({ older, newest })

    const page = await repository.listComments(query() as never)

    // `older` is registered first, so it is the older shard; `newest` is read first.
    expect(page.data.map((comment) => comment.id)).toEqual(["5", "4"])
    expect(newest.chain.limit).toHaveBeenCalledWith(3)
    expect(older.chain.limit).toHaveBeenCalledWith(2)
  })

  test("a failing shard is skipped and the page is flagged partial", async () => {
    const broken = makeClient([])
    broken.chain.limit.mockRejectedValue(new Error("shard down"))
    const healthy = makeClient([row("1", "2026-11-22 10:00:00.000000+00")])
    const { repository } = buildRepository({ broken, healthy })

    const page = await repository.listComments(query() as never)

    expect(page.data.map((comment) => comment.id)).toEqual(["1"])
    expect(page.hasPartialResults).toBe(true)
  })
})

/** A shard client whose update chain answers with `rows` (or fails) and records its clauses. */
const makeUpdateClient = (outcome: {
  rows?: { id: string }[]
  error?: Error
}) => {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi
      .fn()
      .mockImplementation(() =>
        outcome.error
          ? Promise.reject(outcome.error)
          : Promise.resolve(outcome.rows ?? []),
      ),
  }
  return { chain, update: vi.fn().mockReturnValue(chain) }
}

const buildUpdateRepository = (
  clients: Record<string, ReturnType<typeof makeUpdateClient>>,
) => {
  const shards = Object.keys(clients).map(shardInfo)
  const shardManager = {
    getShardsForTimeRange: vi.fn().mockResolvedValue(shards),
    getWriteShardInfo: vi.fn().mockResolvedValue(null),
    getShardClient: vi.fn((shard: { id: string }) =>
      Promise.resolve(clients[shard.id]),
    ),
  }
  return new ShardedMessageRepository(shardManager as never)
}

const createdAt = new Date("2026-11-22T10:00:00.123Z")

describe("ShardedMessageRepository phone-count mark", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("there is no way to take the mark back: an unknown outcome must never be undone", () => {
    const repository = buildUpdateRepository({
      a: makeUpdateClient({ rows: [] }),
    }) as unknown as Record<string, unknown>

    expect(repository.unmarkPhoneCounted).toBeUndefined()
  })

  test("marking sets the mark only where it is not set yet, scoped to the message", async () => {
    const client = makeUpdateClient({ rows: [{ id: "m1" }] })
    const repository = buildUpdateRepository({ a: client })

    const marked = await repository.markPhoneCounted("m1", "ws-1", createdAt)

    expect(marked).toBe(true)
    const set = dialect.sqlToQuery(client.chain.set.mock.calls[0][0].attributes)
    expect(set.sql).toContain("COALESCE")
    expect(set.sql).toContain("||")
    expect(set.sql).toContain('"phoneCounted": true')
    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).toContain('"Message"."id" = $1')
    expect(where.sql).toContain('"Message"."workspaceId" = $2')
    expect(where.sql).toContain("NOT (")
    expect(where.sql).toContain("'phoneCounted'")
    expect(where.params.slice(0, 2)).toEqual(["m1", "ws-1"])
  })

  test("a message that already carries the mark is not marked again", async () => {
    const repository = buildUpdateRepository({
      a: makeUpdateClient({ rows: [] }),
    })

    expect(await repository.markPhoneCounted("m1", "ws-1", createdAt)).toBe(
      false,
    )
  })

  test("a shard failure propagates instead of reading as 'already counted'", async () => {
    const repository = buildUpdateRepository({
      a: makeUpdateClient({ error: new Error("connection lost") }),
    })

    await expect(
      repository.markPhoneCounted("m1", "ws-1", createdAt),
    ).rejects.toThrow()
  })

  test("with no shard available it throws rather than answering false", async () => {
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
    }
    const repository = new ShardedMessageRepository(shardManager as never)

    await expect(
      repository.markPhoneCounted("m1", "ws-1", createdAt),
    ).rejects.toThrow()
  })
})

describe("ShardedMessageRepository quota markers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("claiming sets the key only where it is not set, scoped to the message and its createdAt", async () => {
    const client = makeUpdateClient({ rows: [{ id: "m1" }] })
    const repository = buildUpdateRepository({ a: client })

    const claimed = await repository.claimQuotaMarker(
      "m1",
      "ws-1",
      createdAt,
      "quotaChargedHide",
    )

    expect(claimed).toBe(true)
    const set = dialect.sqlToQuery(client.chain.set.mock.calls[0][0].attributes)
    expect(set.sql).toContain("jsonb_build_object")
    expect(set.params).toContain("quotaChargedHide")
    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).toContain('"Message"."id" = $1')
    expect(where.sql).toContain('"Message"."workspaceId" = $2')
    expect(where.sql).toContain("NOT (")
    expect(where.sql).toContain('"Message"."createdAt"')
    expect(where.params.slice(0, 2)).toEqual(["m1", "ws-1"])
  })

  test("a comment that already carries the marker is not claimed again", async () => {
    const repository = buildUpdateRepository({
      a: makeUpdateClient({ rows: [] }),
    })

    expect(
      await repository.claimQuotaMarker(
        "m1",
        "ws-1",
        createdAt,
        "quotaChargedSkip",
      ),
    ).toBe(false)
  })

  test("releasing removes the key only where it is set", async () => {
    const client = makeUpdateClient({ rows: [{ id: "m1" }] })
    const repository = buildUpdateRepository({ a: client })

    await repository.releaseQuotaMarker(
      "m1",
      "ws-1",
      createdAt,
      "quotaChargedHide",
    )

    const set = dialect.sqlToQuery(client.chain.set.mock.calls[0][0].attributes)
    expect(set.sql).toContain(" - ")
    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).not.toContain("NOT (")
    expect(where.sql).toContain("'true'")
  })

  test("a shard failure propagates on claim and release instead of reading as 'already charged'", async () => {
    const repository = buildUpdateRepository({
      a: makeUpdateClient({ error: new Error("shard down") }),
    })

    await expect(
      repository.claimQuotaMarker("m1", "ws-1", createdAt, "quotaChargedHide"),
    ).rejects.toThrow()
    await expect(
      repository.releaseQuotaMarker(
        "m1",
        "ws-1",
        createdAt,
        "quotaChargedHide",
      ),
    ).rejects.toThrow()
  })

  test("with no shard available it throws rather than answering false", async () => {
    const shardManager = {
      getShardsForTimeRange: vi.fn().mockResolvedValue([]),
      getWriteShardInfo: vi.fn().mockResolvedValue(null),
      getShardClient: vi.fn(),
    }
    const repository = new ShardedMessageRepository(shardManager as never)

    await expect(
      repository.claimQuotaMarker("m1", "ws-1", createdAt, "quotaChargedHide"),
    ).rejects.toThrow()
  })
})

describe("ShardedMessageRepository comment count", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const filter = {
    contactInboxIds: ["ci1"],
    conversationIds: ["c1"],
    hasPhone: true,
  }
  const ids = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      createdAt: new Date(),
      createdAtText: "x",
      id: String(index),
    }))

  test("counts the matching comments with the same conditions as the list, within one limit", async () => {
    const client = makeClient(ids(3) as never)
    const { repository } = buildRepository({ a: client })

    const result = await repository.countComments({
      filter,
      limit: 10,
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ capped: false, count: 3 })
    const where = dialect.sqlToQuery(client.chain.where.mock.calls[0][0])
    expect(where.sql).toContain('"Message"."contactInboxId" = ANY(')
    expect(where.sql).toContain('"Message"."text" ~ ')
    // One row past the limit tells "more than the limit" apart from "exactly it".
    expect(client.chain.limit).toHaveBeenCalledWith(11)
  })

  test("reports a lower bound when the limit is reached", async () => {
    const client = makeClient(ids(11) as never)
    const { repository } = buildRepository({ a: client })

    expect(
      await repository.countComments({
        filter,
        limit: 10,
        workspaceId: "ws-1",
      }),
    ).toEqual({ capped: true, count: 10 })
  })

  test("adds the shards up and stops reading once the limit is passed", async () => {
    const newest = makeClient(ids(6) as never)
    const older = makeClient(ids(6) as never)
    const oldest = makeClient(ids(6) as never)
    const { repository } = buildRepository({ oldest, older, newest })

    const result = await repository.countComments({
      filter,
      limit: 10,
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ capped: true, count: 10 })
    // Two shards give 12 > 10: the third is never asked.
    expect(
      [newest, older, oldest].filter(
        (client) => client.select.mock.calls.length > 0,
      ),
    ).toHaveLength(2)
  })

  test("counts nothing without threads", async () => {
    const client = makeClient([])
    const { repository } = buildRepository({ a: client })

    expect(
      await repository.countComments({
        filter: { ...filter, conversationIds: [] },
        limit: 10,
        workspaceId: "ws-1",
      }),
    ).toEqual({ capped: false, count: 0 })
    expect(client.select).not.toHaveBeenCalled()
  })
})

describe("ShardedMessageRepository attribute patch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("sets only the given keys with one JSON merge, keeping the rest of the object", async () => {
    const client = makeUpdateClient({ rows: [{ id: "m1" }] })
    const repository = buildUpdateRepository({ a: client })

    const result = await repository.patchMessageAttributes(
      "m1",
      "ws-1",
      { hidden: true },
      createdAt,
    )

    expect(result).not.toBeNull()
    const set = dialect.sqlToQuery(client.chain.set.mock.calls[0][0].attributes)
    expect(set.sql).toContain("COALESCE")
    expect(set.sql).toContain("||")
    expect(set.sql).toContain("jsonb_build_object(")
    expect(set.params).toEqual(["hidden", true])
    // Not the replacement of the whole object: a key written meanwhile survives.
    expect(set.sql).not.toContain("liked")
  })

  test("a patch of both keys writes both and an empty patch writes nothing", async () => {
    const client = makeUpdateClient({ rows: [{ id: "m1" }] })
    const repository = buildUpdateRepository({ a: client })

    await repository.patchMessageAttributes(
      "m1",
      "ws-1",
      { hidden: false, liked: true },
      createdAt,
    )
    const set = dialect.sqlToQuery(client.chain.set.mock.calls[0][0].attributes)
    expect(set.params).toEqual(["hidden", false, "liked", true])

    client.update.mockClear()
    expect(
      await repository.patchMessageAttributes("m1", "ws-1", {}, createdAt),
    ).toBeNull()
    expect(client.update).not.toHaveBeenCalled()
  })
})
