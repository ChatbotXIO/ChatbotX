import { sql } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test, vi } from "vitest"
import type { DatabaseClient } from "../src/client"
import {
  MAX_COMMENT_THREADS_PER_READ,
  postCommentRepository,
} from "../src/repositories/channel-post/comments"
import {
  channelPostManagementRepository,
  MAX_LISTED_POST_AUTHORS,
} from "../src/repositories/channel-post/management"

const dialect = new PgDialect()

describe("postCommentRepository.findThreads", () => {
  const build = (rows: unknown[]) => {
    const record: { limit: number; order: unknown[]; where: unknown } = {
      limit: 0,
      order: [],
      where: null,
    }
    const subquery = {
      from: vi.fn().mockReturnThis(),
      // drizzle-orm rc walks `getSQL().queryChunks`; one bound param stands in
      // for the sub-select so the outer parameter numbering stays observable.
      where: vi.fn().mockReturnValue({ getSQL: () => sql`${"semi-join"}` }),
    }
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation((value: unknown) => {
        record.where = value
        return chain
      }),
      orderBy: vi.fn().mockImplementation((...value: unknown[]) => {
        record.order = value
        return chain
      }),
      limit: vi.fn().mockImplementation((value: number) => {
        record.limit = value
        return Promise.resolve(rows)
      }),
    }
    // The semi-join is built on the same client: the outer query and the
    // `EXISTS` sub-selects both come from `select`.
    const select = vi
      .fn()
      .mockImplementation((columns?: object) =>
        columns && "one" in columns ? subquery : chain,
      )
    return {
      record,
      select,
      subquery,
      tx: { select } as unknown as DatabaseClient,
    }
  }

  const keys = [
    { externalPostId: "p1", inboxId: "i1" },
    { externalPostId: "p2", inboxId: "i2" },
  ]

  test("one query for every post, matching each post's source id and requiring a contact inbox in its inbox", async () => {
    const { record, subquery, tx } = build([
      { contactId: "k1", id: "c1", postExternalId: "p1" },
    ])

    const threads = await postCommentRepository.findThreads(
      { posts: keys, workspaceId: "ws-1" },
      tx,
    )

    const where = dialect.sqlToQuery(record.where as never)
    expect(where.sql).toContain('"Conversation"."workspaceId" = $1')
    expect(where.sql).toContain('"Conversation"."sourceId" = $2')
    expect(where.sql).toContain('"Conversation"."sourceId" = $4')
    expect(where.sql).toContain("exists (")
    expect(where.sql).toContain(" or ")
    // The semi-join sub-selects stand at $3 and $5 here (mocked as opaque values).
    expect(where.params[0]).toBe("ws-1")
    expect(where.params[1]).toBe("p1")
    expect(where.params[3]).toBe("p2")
    // One semi-join per post, each on the post's own inbox.
    expect(subquery.where).toHaveBeenCalledTimes(2)
    const inboxParams = subquery.where.mock.calls.map(
      ([condition]) => dialect.sqlToQuery(condition).params,
    )
    expect(inboxParams).toEqual([["i1"], ["i2"]])
    expect(threads).toEqual([
      { contactId: "k1", id: "c1", postExternalId: "p1" },
    ])
  })

  test("never joins the contact's inboxes, which would repeat a conversation per row", async () => {
    const { tx } = build([])
    const chain = (tx.select as unknown as ReturnType<typeof vi.fn>)()
    expect(chain.innerJoin).toBeUndefined()

    await postCommentRepository.findThreads(
      { posts: keys, workspaceId: "ws-1" },
      tx,
    )
    expect(chain.innerJoin).toBeUndefined()
  })

  test("caps the threads of the whole read and lists the most recently active first", async () => {
    const { record, tx } = build([])

    await postCommentRepository.findThreads(
      { posts: keys, workspaceId: "ws-1" },
      tx,
    )

    expect(record.limit).toBe(MAX_COMMENT_THREADS_PER_READ)
    const order = dialect.sqlToQuery(record.order[0] as never)
    expect(order.sql).toContain("DESC NULLS LAST")
  })

  test("reads nothing for no posts", async () => {
    const { select, tx } = build([])

    expect(
      await postCommentRepository.findThreads(
        { posts: [], workspaceId: "ws-1" },
        tx,
      ),
    ).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })

  test("a thread with no source id is never returned", async () => {
    const { tx } = build([{ contactId: "k1", id: "c1", postExternalId: null }])

    expect(
      await postCommentRepository.findThreads(
        { posts: keys, workspaceId: "ws-1" },
        tx,
      ),
    ).toEqual([])
  })
})

describe("postCommentRepository.findContactInboxes", () => {
  const build = (rows: unknown[]) => {
    const where = vi.fn().mockResolvedValue(rows)
    const chain = { from: vi.fn().mockReturnThis(), where }
    return {
      select: vi.fn().mockReturnValue(chain),
      tx: {
        select: vi.fn().mockReturnValue(chain),
      } as unknown as DatabaseClient,
      where,
    }
  }

  test("one query with one array parameter per list", async () => {
    const { tx, where } = build([{ contactId: "k1", id: "ci1", inboxId: "i1" }])

    const rows = await postCommentRepository.findContactInboxes(
      { contactIds: ["k1", "k1", "k2"], inboxIds: ["i1"] },
      tx,
    )

    const query = dialect.sqlToQuery(where.mock.calls[0][0])
    expect(query.sql).toContain(
      '"ContactInbox"."contactId" = ANY($1::bigint[])',
    )
    expect(query.sql).toContain('"ContactInbox"."inboxId" = ANY($2::bigint[])')
    expect(query.params).toEqual([["k1", "k2"], ["i1"]])
    expect(rows).toEqual([{ contactId: "k1", id: "ci1", inboxId: "i1" }])
  })

  test("a hundred thousand contacts still bind two parameters", async () => {
    const { tx, where } = build([])
    const contactIds = Array.from({ length: 100_000 }, (_, index) =>
      String(index + 1),
    )

    await postCommentRepository.findContactInboxes(
      { contactIds, inboxIds: ["i1"] },
      tx,
    )

    const query = dialect.sqlToQuery(where.mock.calls[0][0])
    expect(query.params).toHaveLength(2)
    expect(query.params[0]).toHaveLength(100_000)
  })

  test("nothing to look up reads nothing", async () => {
    const { select, tx } = build([])

    expect(
      await postCommentRepository.findContactInboxes(
        { contactIds: [], inboxIds: ["i1"] },
        tx,
      ),
    ).toEqual([])
    expect(
      await postCommentRepository.findContactInboxes(
        { contactIds: ["k1"], inboxIds: [] },
        tx,
      ),
    ).toEqual([])
    expect(select).not.toHaveBeenCalled()
  })
})

describe("postCommentRepository.findCommenters", () => {
  const build = (contacts: unknown[], tags: unknown[]) => {
    const wheres: unknown[] = []
    let call = 0
    const select = vi.fn().mockImplementation(() => {
      const rows = call++ === 0 ? contacts : tags
      const chain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockImplementation((value: unknown) => {
          wheres.push(value)
          return Promise.resolve(rows)
        }),
      }
      return chain
    })
    return { tx: { select } as unknown as DatabaseClient, select, wheres }
  }

  test("two queries for the whole page, scoped to the workspace", async () => {
    const { select, tx, wheres } = build(
      [{ avatar: null, id: "k1", name: "An", phoneNumber: "0901234567" }],
      [{ contactId: "k1", id: "t1", name: "VIP" }],
    )

    const commenters = await postCommentRepository.findCommenters(
      { contactIds: ["k1", "k1"], workspaceId: "ws-1" },
      tx,
    )

    expect(select).toHaveBeenCalledTimes(2)
    const contactWhere = dialect.sqlToQuery(wheres[0] as never)
    expect(contactWhere.sql).toContain('"Contact"."workspaceId" = $1')
    expect(contactWhere.sql).toContain('"Contact"."id" = ANY($2::bigint[])')
    expect(contactWhere.params).toEqual(["ws-1", ["k1"]])
    const tagWhere = dialect.sqlToQuery(wheres[1] as never)
    expect(tagWhere.sql).toContain(
      '"ContactToTag"."contactId" = ANY($1::bigint[])',
    )
    expect(tagWhere.sql).toContain('"Tag"."workspaceId"')
    expect(tagWhere.sql).toContain('"Tag"."deletedAt" is null')
    expect(commenters).toEqual([
      {
        avatar: null,
        id: "k1",
        name: "An",
        phoneNumber: "0901234567",
        tags: [{ id: "t1", name: "VIP" }],
      },
    ])
  })

  test("a hundred thousand contacts still bind one array parameter per query", async () => {
    const { tx, wheres } = build([], [])
    const contactIds = Array.from({ length: 100_000 }, (_, index) =>
      String(index + 1),
    )

    await postCommentRepository.findCommenters(
      { contactIds, workspaceId: "ws-1" },
      tx,
    )

    const contactWhere = dialect.sqlToQuery(wheres[0] as never)
    const tagWhere = dialect.sqlToQuery(wheres[1] as never)
    expect(contactWhere.params).toHaveLength(2)
    expect(tagWhere.params).toHaveLength(2)
    expect(contactWhere.params[1]).toHaveLength(100_000)
  })

  test("a contact with no tags gets an empty list, and no ids reads nothing", async () => {
    const { tx } = build(
      [{ avatar: null, id: "k1", name: null, phoneNumber: null }],
      [],
    )
    const [commenter] = await postCommentRepository.findCommenters(
      { contactIds: ["k1"], workspaceId: "ws-1" },
      tx,
    )
    expect(commenter.tags).toEqual([])

    const none = build([], [])
    expect(
      await postCommentRepository.findCommenters(
        { contactIds: [], workspaceId: "ws-1" },
        none.tx,
      ),
    ).toEqual([])
    expect(none.select).not.toHaveBeenCalled()
  })
})

describe("channelPostManagementRepository.listAuthors", () => {
  test("groups by inbox and author, joins the inbox and returns a unique key", async () => {
    const { chain, tx } = build([
      {
        authorExternalId: "u1",
        authorName: "Titan",
        channel: "messenger",
        inboxId: "7",
        inboxName: "Page A",
        postsCount: 2,
      },
      {
        authorExternalId: "u1",
        authorName: "Titan",
        channel: "instagram",
        inboxId: "8",
        inboxName: "Page B",
        postsCount: 1,
      },
    ])

    const items = await channelPostManagementRepository.listAuthors(
      { workspaceId: "ws-1" },
      tx,
    )

    expect(chain.innerJoin).toHaveBeenCalledTimes(1)
    expect(chain.groupBy.mock.calls[0]).toHaveLength(4)
    expect(items.map((item) => item.authorKey)).toEqual(["7:u1", "8:u1"])
  })

  const build = (rows: unknown[]) => {
    const record: { limit: number; order: unknown[]; where: unknown } = {
      limit: 0,
      order: [],
      where: null,
    }
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation((value: unknown) => {
        record.where = value
        return chain
      }),
      innerJoin: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockImplementation((...value: unknown[]) => {
        record.order = value
        return chain
      }),
      limit: vi.fn().mockImplementation((value: number) => {
        record.limit = value
        return Promise.resolve(rows)
      }),
    }
    return {
      chain,
      record,
      tx: {
        select: vi.fn().mockReturnValue(chain),
      } as unknown as DatabaseClient,
    }
  }

  test("scopes to the workspace, skips posts with no author and groups by author id", async () => {
    const { chain, record, tx } = build([])

    await channelPostManagementRepository.listAuthors(
      { workspaceId: "ws-1" },
      tx,
    )

    const where = dialect.sqlToQuery(record.where as never)
    expect(where.sql).toContain('"ChannelPost"."workspaceId" = $1')
    expect(where.sql).toContain('"ChannelPost"."removedAt" is null')
    expect(where.sql).toContain('"ChannelPost"."authorExternalId" is not null')
    expect(where.params).toEqual(["ws-1"])
    expect(chain.groupBy).toHaveBeenCalledTimes(1)
    expect(record.limit).toBe(MAX_LISTED_POST_AUTHORS)
  })

  test("orders by posts count descending, then name", async () => {
    const { record, tx } = build([])

    await channelPostManagementRepository.listAuthors(
      { workspaceId: "ws-1" },
      tx,
    )

    const order = record.order.map(
      (part) => dialect.sqlToQuery(part as never).sql,
    )
    expect(order[0]).toContain("desc")
    expect(order[0]).toContain("count(*)")
    expect(order[1]).toContain("asc")
  })

  test("narrows by channel and inbox with bound parameters", async () => {
    const { record, tx } = build([])

    await channelPostManagementRepository.listAuthors(
      {
        channels: ["messenger"],
        inboxIds: ["i1", "i2"],
        workspaceId: "ws-1",
      },
      tx,
    )

    const where = dialect.sqlToQuery(record.where as never)
    expect(where.sql).toContain('"ChannelPost"."channel" in')
    expect(where.sql).toContain('"ChannelPost"."inboxId" in')
    expect(where.params).toEqual(["ws-1", "messenger", "i1", "i2"])
  })

  test("returns the aggregated rows", async () => {
    const { tx } = build([
      {
        authorExternalId: "a1",
        authorName: "Shop",
        channel: "messenger",
        inboxId: "7",
        inboxName: "Page",
        postsCount: 3,
      },
      { authorExternalId: null, authorName: null, postsCount: 9 },
    ])

    expect(
      await channelPostManagementRepository.listAuthors(
        { workspaceId: "ws-1" },
        tx,
      ),
    ).toEqual([
      {
        authorExternalId: "a1",
        authorKey: "7:a1",
        authorName: "Shop",
        channel: "messenger",
        inboxId: "7",
        inboxName: "Page",
        postsCount: 3,
      },
    ])
  })
})

describe("channelPostManagementRepository.list authorIds filter", () => {
  test("an author key filters on that inbox and author only", async () => {
    const limit = vi.fn().mockResolvedValue([])
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const innerJoin = vi.fn().mockReturnValue({ where })
    const from = vi.fn().mockReturnValue({ innerJoin })
    const tx = {
      select: vi.fn().mockReturnValue({ from }),
    } as unknown as DatabaseClient

    await channelPostManagementRepository.list(
      {
        filters: { authorIds: ["7:u1"], hasComments: false },
        limit: 31,
        sort: "newest",
        workspaceId: "ws-1",
      },
      tx,
    )

    const query = dialect.sqlToQuery(where.mock.calls[0][0])
    expect(query.sql).toContain('"ChannelPost"."inboxId" = $')
    expect(query.sql).toContain('"ChannelPost"."authorExternalId" = $')
    expect(query.params).toContain("7")
    expect(query.params).toContain("u1")
  })

  test("filters on the author id with bound parameters", async () => {
    const limit = vi.fn().mockResolvedValue([])
    const orderBy = vi.fn().mockReturnValue({ limit })
    const where = vi.fn().mockReturnValue({ orderBy })
    const innerJoin = vi.fn().mockReturnValue({ where })
    const from = vi.fn().mockReturnValue({ innerJoin })
    const tx = {
      select: vi.fn().mockReturnValue({ from }),
    } as unknown as DatabaseClient

    await channelPostManagementRepository.list(
      {
        filters: { authorIds: ["a1", "a2"], hasComments: false },
        limit: 31,
        sort: "newest",
        workspaceId: "ws-1",
      },
      tx,
    )

    const query = dialect.sqlToQuery(where.mock.calls[0][0])
    expect(query.sql).toContain('"ChannelPost"."authorExternalId" in')
    expect(query.params).toEqual(["ws-1", "a1", "a2"])
  })
})
