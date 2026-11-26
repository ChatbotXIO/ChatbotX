import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertRoom: vi.fn(),
  commenterEmail: vi.fn(),
  charge: vi.fn(),
  findByIds: vi.fn(),
  listPosts: vi.fn(),
  mergeView: vi.fn(),
  openReader: vi.fn(),
  preloadCommenters: vi.fn(),
}))

vi.mock("../src/channel-post/comments.service", () => ({
  MAX_COMMENTS_PAGE_SIZE: 100,
  MAX_MERGE_VIEW_POSTS: 20,
  channelPostCommentsService: { openReader: mocks.openReader },
}))

vi.mock("../src/channel-post/management.service", () => ({
  channelPostManagementService: { list: mocks.listPosts },
}))

vi.mock("../src/message-usage/service", () => ({
  messageUsageService: { assertRoom: mocks.assertRoom, charge: mocks.charge },
}))

const {
  channelPostExportService,
  EXPORT_TIME_BUDGET_MS,
  MAX_EXPORT_POST_ROWS,
  MAX_EXPORT_ROWS,
} = await import("../src/channel-post/export.service")

const COMMENTS_FILE_NAME = /^post-comments-\d{4}-\d{2}-\d{2}\.csv$/
const ROWS_FILE_NAME = /^post-rows-\d{4}-\d{2}-\d{2}\.csv$/
const PHONES_FILE_NAME = /^post-phones-/
const EMAILS_FILE_NAME = /^post-emails-/
const ENDS_WITH_TRUE = /"true"$/

const author = (
  id: string,
  name: string | null,
  phoneNumber: string | null = null,
) => ({ avatar: null, id, name, phoneNumber, tags: [] })

const comment = (overrides: Record<string, unknown> = {}) => ({
  author: author("k1", "An", "0901234567"),
  commentId: "c1",
  createdAt: new Date("2026-11-22T10:00:00.000Z"),
  hidden: false,
  id: "m1",
  liked: false,
  page: null,
  parentCommentId: null,
  postId: "p1",
  sender: "contact",
  text: "hello",
  ...overrides,
})

const base = {
  canViewEmailAndPhone: true,
  kind: "comments" as const,
  postIds: ["p1"],
  workspaceId: "ws-1",
}

/** Lines of a CSV, header first (the fixtures hold no line breaks inside a cell). */
const lines = (csv: string) => csv.trimEnd().split("\n")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertRoom.mockResolvedValue(undefined)
  mocks.charge.mockResolvedValue(undefined)
  // The reader the service opens: its posts come from `findByIds`, and each
  // page read is recorded on `mergeView` together with what the reader was opened with.
  mocks.commenterEmail.mockReturnValue(null)
  mocks.openReader.mockImplementation(async (readerInput: object) => ({
    commenterEmail: mocks.commenterEmail,
    posts: await mocks.findByIds(),
    preloadCommenters: mocks.preloadCommenters,
    readPage: (pageInput: object) =>
      mocks.mergeView({ ...readerInput, ...pageInput }),
    threadsCapped: false,
  }))
  mocks.preloadCommenters.mockResolvedValue(undefined)
  mocks.findByIds.mockResolvedValue([
    { caption: "Flash sale", externalPostId: "ext-1", id: "p1" },
    { caption: null, externalPostId: "ext-2", id: "p2" },
  ])
  mocks.mergeView.mockResolvedValue({ items: [comment()] })
})

describe("channelPostExportService.build — comments", () => {
  test("writes a header and one row per comment", async () => {
    const file = await channelPostExportService.build(base)

    expect(lines(file.csv)).toEqual([
      '"createdAt","post","customer","phone","text","hidden"',
      '"2026-11-22T10:00:00.000Z","Flash sale","An","0901234567","hello","false"',
    ])
    expect(file).toMatchObject({ rowCount: 1, truncated: false })
    expect(file.fileName).toMatch(COMMENTS_FILE_NAME)
  })

  test("labels a post with no caption by its external id and marks hidden comments", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [comment({ hidden: true, postId: "p2" })],
    })

    const file = await channelPostExportService.build({
      ...base,
      postIds: ["p2"],
    })

    expect(lines(file.csv)[1]).toContain('"ext-2"')
    expect(lines(file.csv)[1]).toMatch(ENDS_WITH_TRUE)
  })

  test("a commenter without a name falls back to their contact id, a deleted one to blank", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [
        comment({ author: author("k9", null) }),
        comment({ author: null, id: "m2" }),
      ],
    })

    const file = await channelPostExportService.build(base)

    expect(lines(file.csv)[1]).toContain('"k9"')
    expect(lines(file.csv)[2]).toContain('"","","hello"')
  })

  test("a reply the page sent shows the page's name as the customer and no phone", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [
        comment({
          author: author("k1", "An", "0901234567"),
          page: { avatar: null, name: "Shop Page" },
          sender: "page",
          text: "Thanks!",
        }),
      ],
    })

    const file = await channelPostExportService.build(base)

    expect(lines(file.csv)[1]).toContain('"Shop Page","","Thanks!"')
  })

  test("without the phone permission the phone column is blank, and the export still works", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [comment({ author: author("k1", "An", null), text: "call •••" })],
    })

    const file = await channelPostExportService.build({
      ...base,
      canViewEmailAndPhone: false,
    })

    expect(lines(file.csv)[1]).toContain('"An","","call •••"')
    expect(mocks.mergeView).toHaveBeenCalledWith(
      expect.objectContaining({ canViewEmailAndPhone: false }),
    )
  })

  test("escapes quotes, flattens line breaks and neutralises formulas", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [
        comment({ text: 'say "hi"\nthen =HYPERLINK("x")' }),
        comment({ author: author("k2", "=cmd|' /C calc'!A0"), id: "m2" }),
        comment({ author: author("k3", "+1 555"), id: "m3" }),
        comment({ author: author("k4", "@sum"), id: "m4" }),
        comment({ author: author("k5", "\tTab"), id: "m5" }),
        comment({ author: author("k6", "-1+1"), id: "m6" }),
      ],
    })

    const file = await channelPostExportService.build(base)
    const rows = lines(file.csv)

    expect(rows).toHaveLength(7)
    expect(rows[1]).toContain('"say ""hi"" then =HYPERLINK(""x"")"')
    expect(rows[2]).toContain(`"'=cmd|' /C calc'!A0"`)
    expect(rows[3]).toContain('"\'+1 555"')
    expect(rows[4]).toContain('"\'@sum"')
    expect(rows[5]).toContain('"\'\tTab"')
    expect(rows[6]).toContain('"\'-1+1"')
  })

  test("pages through the reader with the keyset cursor until it ends", async () => {
    const cursor1 = { createdAt: "2026-11-22 10:00:00.000001+00", id: "1" }
    const cursor2 = { createdAt: "2026-11-22 09:00:00.000001+00", id: "2" }
    mocks.mergeView
      .mockResolvedValueOnce({
        items: [comment({ id: "m1" })],
        nextCursor: cursor1,
      })
      .mockResolvedValueOnce({
        items: [comment({ id: "m2" })],
        nextCursor: cursor2,
      })
      .mockResolvedValueOnce({ items: [comment({ id: "m3" })] })

    const file = await channelPostExportService.build({
      ...base,
      search: "hello",
    })

    expect(mocks.mergeView).toHaveBeenCalledTimes(3)
    expect(mocks.mergeView.mock.calls.map(([call]) => call.cursor)).toEqual([
      undefined,
      cursor1,
      cursor2,
    ])
    expect(mocks.mergeView.mock.calls[0][0]).toMatchObject({
      hasPhone: undefined,
      limit: 100,
      postIds: ["p1"],
      search: "hello",
      workspaceId: "ws-1",
    })
    expect(file.rowCount).toBe(3)
    expect(file.truncated).toBe(false)
  })

  test("stops at the row cap and says the file was cut", async () => {
    const page = Array.from({ length: 100 }, (_, index) =>
      comment({ id: `m${index}` }),
    )
    mocks.mergeView.mockResolvedValue({
      items: page,
      nextCursor: { createdAt: "2026-11-22 10:00:00.000001+00", id: "1" },
    })

    const file = await channelPostExportService.build(base)

    expect(file.rowCount).toBe(MAX_EXPORT_ROWS)
    expect(file.truncated).toBe(true)
    expect(mocks.mergeView).toHaveBeenCalledTimes(MAX_EXPORT_ROWS / 100)
  })

  test("cuts a partial final page at the cap instead of appending the whole page", async () => {
    const page = Array.from({ length: 150 }, (_, index) =>
      comment({ id: `m${index}` }),
    )
    mocks.mergeView.mockResolvedValue({
      items: page,
      nextCursor: { createdAt: "2026-11-22 10:00:00.000001+00", id: "1" },
    })

    const file = await channelPostExportService.build(base)

    expect(file.rowCount).toBe(MAX_EXPORT_ROWS)
    expect(file.truncated).toBe(true)
  })

  test("a result that ends exactly on the cap is not flagged truncated", async () => {
    const page = Array.from({ length: 100 }, (_, index) =>
      comment({ id: `m${index}` }),
    )
    let calls = 0
    mocks.mergeView.mockImplementation(() => {
      calls += 1
      return Promise.resolve(
        calls < MAX_EXPORT_ROWS / 100
          ? {
              items: page,
              nextCursor: {
                createdAt: "2026-11-22 10:00:00.000001+00",
                id: "1",
              },
            }
          : { items: page },
      )
    })

    const file = await channelPostExportService.build(base)

    expect(file.rowCount).toBe(MAX_EXPORT_ROWS)
    expect(file.truncated).toBe(false)
  })
})

describe("channelPostExportService.build — phones", () => {
  const phones = { ...base, kind: "phones" as const }

  test("asks the reader only for comments that carry a phone number", async () => {
    await channelPostExportService.build(phones)

    expect(mocks.mergeView.mock.calls[0][0]).toMatchObject({ hasPhone: true })
  })

  test("is refused, never partial, without the phone permission", async () => {
    await expect(
      channelPostExportService.build({
        ...phones,
        canViewEmailAndPhone: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", httpStatusCode: 403 })
    expect(mocks.openReader).not.toHaveBeenCalled()
    expect(mocks.mergeView).not.toHaveBeenCalled()
  })

  test("a reply the page sent is not a customer: the phones file skips it", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [
        comment({
          author: author("k1", "An", "0901234567"),
          id: "m2",
          page: { avatar: null, name: "Shop Page" },
          sender: "page",
          text: "Call us on 0987 654 321",
        }),
        comment({ author: author("k1", "An", "0901234567") }),
      ],
    })

    const file = await channelPostExportService.build({
      ...phones,
      postIds: ["p1"],
    })

    expect(lines(file.csv)).toEqual([
      '"customer","phone","firstCommentAt","post"',
      '"An","0901234567","2026-11-22T10:00:00.000Z","Flash sale"',
    ])
    expect(file.rowCount).toBe(1)
  })

  test("the export reads comments without resolving avatars", async () => {
    await channelPostExportService.build(base)

    expect(mocks.openReader).toHaveBeenCalledWith(
      expect.objectContaining({ includeAvatars: false }),
    )
  })

  test("writes one row per customer, holding their first comment's time and post", async () => {
    // Newest first, so the older comment of k1 comes later and wins; rows keep the
    // order customers first appeared in.
    mocks.mergeView.mockResolvedValue({
      items: [
        comment({
          createdAt: new Date("2026-11-22T12:00:00.000Z"),
          id: "m3",
          postId: "p1",
        }),
        comment({
          author: author("k2", "Binh", null),
          createdAt: new Date("2026-11-22T11:00:00.000Z"),
          id: "m2",
          postId: "p2",
          text: "my number 0912 345 678 ok",
        }),
        comment({
          createdAt: new Date("2026-11-22T09:00:00.000Z"),
          id: "m1",
          postId: "p2",
        }),
      ],
    })

    const file = await channelPostExportService.build({
      ...phones,
      postIds: ["p1", "p2"],
    })

    expect(lines(file.csv)).toEqual([
      '"customer","phone","firstCommentAt","post"',
      '"An","0901234567","2026-11-22T09:00:00.000Z","ext-2"',
      '"Binh","0912 345 678","2026-11-22T11:00:00.000Z","ext-2"',
    ])
    expect(file.rowCount).toBe(2)
    expect(file.fileName).toMatch(PHONES_FILE_NAME)
  })
})

describe("channelPostExportService.build — emails", () => {
  const emails = { ...base, kind: "emails" as const }

  test("is refused, never partial, without the phone-and-email permission", async () => {
    await expect(
      channelPostExportService.build({
        ...emails,
        canViewEmailAndPhone: false,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", httpStatusCode: 403 })
    expect(mocks.openReader).not.toHaveBeenCalled()
    expect(mocks.assertRoom).not.toHaveBeenCalled()
  })

  test("reads every comment, not only those with a phone number", async () => {
    await channelPostExportService.build(emails)

    expect(mocks.mergeView.mock.calls[0][0].hasPhone).toBeUndefined()
  })

  test("uses the contact's email, lower-cased, before an address in the text", async () => {
    mocks.commenterEmail.mockReturnValue("An@Example.COM")
    mocks.mergeView.mockResolvedValue({
      items: [comment({ text: "write to other@site.vn" })],
    })

    const file = await channelPostExportService.build(emails)

    expect(lines(file.csv)).toEqual([
      '"customer","email","firstCommentAt","post"',
      '"An","an@example.com","2026-11-22T10:00:00.000Z","Flash sale"',
    ])
    expect(mocks.commenterEmail).toHaveBeenCalledWith("k1")
    expect(file.fileName).toMatch(EMAILS_FILE_NAME)
  })

  test("falls back to the first address written in the comment", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [comment({ text: "mail me: Binh.Tran@Shop.vn or b@x.io" })],
    })

    const file = await channelPostExportService.build(emails)

    expect(lines(file.csv)[1]).toContain('"binh.tran@shop.vn"')
  })

  test("a comment with no email adds no row", async () => {
    const file = await channelPostExportService.build(emails)

    expect(file.rowCount).toBe(0)
    expect(lines(file.csv)).toHaveLength(1)
  })

  test("one row per distinct email, holding its first comment", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [
        comment({
          createdAt: new Date("2026-11-22T12:00:00.000Z"),
          id: "m2",
          text: "a@x.io",
        }),
        comment({
          author: author("k2", "Binh"),
          createdAt: new Date("2026-11-22T09:00:00.000Z"),
          id: "m1",
          text: "A@X.io",
        }),
      ],
    })

    const file = await channelPostExportService.build(emails)

    expect(lines(file.csv)).toEqual([
      '"customer","email","firstCommentAt","post"',
      '"Binh","a@x.io","2026-11-22T09:00:00.000Z","Flash sale"',
    ])
  })

  test("a reply the page sent is not a customer's email", async () => {
    mocks.mergeView.mockResolvedValue({
      items: [
        comment({
          page: { avatar: null, name: "Shop" },
          sender: "page",
          text: "Mail us at shop@x.io",
        }),
      ],
    })

    const file = await channelPostExportService.build(emails)

    expect(file.rowCount).toBe(0)
  })
})

describe("channelPostExportService.build — input", () => {
  test("rejects none or too many posts before reading anything", async () => {
    await expect(
      channelPostExportService.build({ ...base, postIds: [] }),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      channelPostExportService.build({
        ...base,
        postIds: Array.from({ length: 21 }, (_, index) => String(index + 1)),
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.openReader).not.toHaveBeenCalled()
  })

  test("repeats of one post id are one post", async () => {
    await channelPostExportService.build({ ...base, postIds: ["p1", "p1"] })

    expect(mocks.mergeView.mock.calls[0][0].postIds).toEqual(["p1"])
  })

  test("an empty result is a header-only file", async () => {
    mocks.mergeView.mockResolvedValue({ items: [] })

    const file = await channelPostExportService.build(base)

    expect(lines(file.csv)).toHaveLength(1)
    expect(file.rowCount).toBe(0)
  })
})

describe("channelPostExportService.build — partial reads", () => {
  test("refuses the export and charges nothing when a page came back partial", async () => {
    mocks.mergeView.mockResolvedValueOnce({
      hasPartialResults: true,
      items: [comment()],
    })

    await expect(channelPostExportService.build(base)).rejects.toMatchObject({
      code: "postCommentsUnavailable",
      httpStatusCode: 503,
    })
    expect(mocks.charge).not.toHaveBeenCalled()
  })

  test("refuses when a later page is partial, however many pages came before", async () => {
    const cursor = { createdAt: "2026-11-22 10:00:00.000001+00", id: "1" }
    mocks.mergeView
      .mockResolvedValueOnce({ items: [comment()], nextCursor: cursor })
      .mockResolvedValueOnce({ hasPartialResults: true, items: [] })

    await expect(channelPostExportService.build(base)).rejects.toMatchObject({
      code: "postCommentsUnavailable",
    })
    expect(mocks.charge).not.toHaveBeenCalled()
  })
})

describe("channelPostExportService.build — cost", () => {
  const page = (id: string) => ({ items: [comment({ id })] })
  const cursor = { createdAt: "2026-11-22 10:00:00.000001+00", id: "1" }

  test("opens one reader and looks the commenters up once, however many pages follow", async () => {
    mocks.mergeView
      .mockResolvedValueOnce({ ...page("m1"), nextCursor: cursor })
      .mockResolvedValueOnce({ ...page("m2"), nextCursor: cursor })
      .mockResolvedValueOnce(page("m3"))

    await channelPostExportService.build(base)

    expect(mocks.openReader).toHaveBeenCalledTimes(1)
    expect(mocks.preloadCommenters).toHaveBeenCalledTimes(1)
    expect(mocks.mergeView).toHaveBeenCalledTimes(3)
  })

  test("the reader is opened with the caller's permission, filter and search", async () => {
    await channelPostExportService.build({
      ...base,
      canViewEmailAndPhone: false,
      search: "hello",
    })

    expect(mocks.openReader).toHaveBeenCalledWith({
      canViewEmailAndPhone: false,
      hasPhone: undefined,
      includeAvatars: false,
      postIds: ["p1"],
      search: "hello",
      workspaceId: "ws-1",
    })
  })

  test("a search the reader refuses fails the export before any page is read", async () => {
    mocks.openReader.mockRejectedValueOnce(
      Object.assign(new Error("no phones"), { code: "validation" }),
    )

    await expect(
      channelPostExportService.build({
        ...base,
        canViewEmailAndPhone: false,
        search: "0901234567",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.mergeView).not.toHaveBeenCalled()
  })
})

describe("channelPostExportService.build — time budget", () => {
  const cursor = { createdAt: "2026-11-22 10:00:00.000001+00", id: "1" }
  const withClock = () => {
    let at = 1_000_000
    return {
      advance: (ms: number) => {
        at += ms
      },
      now: () => at,
    }
  }

  test("stops once the budget is spent and says the file was cut", async () => {
    const clock = withClock()
    mocks.mergeView.mockImplementation(() => {
      clock.advance(EXPORT_TIME_BUDGET_MS / 2)
      return Promise.resolve({
        items: [comment()],
        nextCursor: cursor,
      })
    })

    const file = await channelPostExportService.build(base, clock.now)

    // Two pages fit in the budget; the third would not be started.
    expect(mocks.mergeView).toHaveBeenCalledTimes(2)
    expect(file.truncated).toBe(true)
    expect(file.rowCount).toBe(2)
  })

  test("a read that finishes inside the budget is not truncated", async () => {
    const clock = withClock()
    mocks.mergeView
      .mockImplementationOnce(() => {
        clock.advance(EXPORT_TIME_BUDGET_MS - 1)
        return Promise.resolve({ items: [comment()], nextCursor: cursor })
      })
      .mockResolvedValueOnce({ items: [comment({ id: "m2" })] })

    const file = await channelPostExportService.build(base, clock.now)

    expect(file.truncated).toBe(false)
    expect(file.rowCount).toBe(2)
  })

  test("a reader whose thread lookup hit its cap flags the file truncated below the row cap", async () => {
    mocks.openReader.mockImplementation(async () => ({
      commenterEmail: mocks.commenterEmail,
      posts: await mocks.findByIds(),
      preloadCommenters: mocks.preloadCommenters,
      readPage: (pageInput: object) => mocks.mergeView(pageInput),
      threadsCapped: true,
    }))

    const file = await channelPostExportService.build(base)

    expect(file.rowCount).toBeLessThan(MAX_EXPORT_ROWS)
    expect(file.truncated).toBe(true)
    expect(mocks.charge).toHaveBeenCalledTimes(1)
  })

  test("a budget spent on the last page is not a truncation", async () => {
    const clock = withClock()
    mocks.mergeView.mockImplementation(() => {
      clock.advance(EXPORT_TIME_BUDGET_MS * 2)
      return Promise.resolve({ items: [comment()] })
    })

    const file = await channelPostExportService.build(base, clock.now)

    expect(file.truncated).toBe(false)
  })

  test("the budget is a named constant of twenty seconds", () => {
    expect(EXPORT_TIME_BUDGET_MS).toBe(20_000)
  })
})

describe("channelPostExportService.build — message quota", () => {
  test("a download with no message left is refused before anything is read", async () => {
    mocks.assertRoom.mockRejectedValue(new Error("postMessageQuotaExceeded"))

    await expect(channelPostExportService.build(base)).rejects.toThrow(
      "postMessageQuotaExceeded",
    )

    expect(mocks.assertRoom).toHaveBeenCalledWith("ws-1")
    expect(mocks.openReader).not.toHaveBeenCalled()
    expect(mocks.charge).not.toHaveBeenCalled()
  })

  test("a completed download charges exactly one message, after the file is built", async () => {
    mocks.charge.mockImplementation(() => {
      expect(mocks.mergeView).toHaveBeenCalled()
      return Promise.resolve()
    })

    await channelPostExportService.build(base)

    expect(mocks.charge).toHaveBeenCalledTimes(1)
    expect(mocks.charge).toHaveBeenCalledWith({ count: 1, workspaceId: "ws-1" })
  })

  test("a truncated or empty file still counts as one download", async () => {
    mocks.mergeView.mockResolvedValue({ items: [] })

    await channelPostExportService.build(base)

    expect(mocks.charge).toHaveBeenCalledTimes(1)
  })

  test("a failed read charges nothing", async () => {
    mocks.mergeView.mockRejectedValue(new Error("db down"))

    await expect(channelPostExportService.build(base)).rejects.toThrow(
      "db down",
    )

    expect(mocks.charge).not.toHaveBeenCalled()
  })

  test("a request refused for its input or permission does not reach the quota", async () => {
    await expect(
      channelPostExportService.build({ ...base, postIds: [] }),
    ).rejects.toThrow()
    await expect(
      channelPostExportService.build({
        ...base,
        canViewEmailAndPhone: false,
        kind: "phones",
      }),
    ).rejects.toThrow()

    expect(mocks.assertRoom).not.toHaveBeenCalled()
    expect(mocks.charge).not.toHaveBeenCalled()
  })
})

const managedPost = (overrides: Record<string, unknown> = {}) => ({
  authorExternalId: "a1",
  authorName: "Page Admin",
  caption: "Flash sale\nnow",
  channel: "messenger",
  commentsCount: 4,
  contentType: "photo",
  externalPostId: "ext-1",
  inboxName: "My Page",
  mediaType: null,
  permalink: "https://example.test/p/1",
  phoneCommentsCount: 2,
  publishedAt: new Date("2026-11-20T08:00:00.000Z"),
  reactionsCount: 9,
  sharesCount: 1,
  topics: [
    { color: null, id: "t1", name: "Sale" },
    { color: null, id: "t2", name: "Launch" },
  ],
  ...overrides,
})

const rowsInput = {
  canViewEmailAndPhone: false,
  kind: "rows" as const,
  workspaceId: "ws-1",
}

describe("channelPostExportService.build — rows", () => {
  beforeEach(() => {
    mocks.listPosts.mockResolvedValue({ items: [managedPost()] })
  })

  test("writes one row per post with the list's columns", async () => {
    const file = await channelPostExportService.build(rowsInput)

    expect(lines(file.csv)).toEqual([
      '"publishedAt","channel","page","type","text","comments","reactions","shares","phones","topics","author","link","externalPostId"',
      '"2026-11-20T08:00:00.000Z","messenger","My Page","photo","Flash sale now","4","9","1","2","Sale; Launch","Page Admin","https://example.test/p/1","ext-1"',
    ])
    expect(file.fileName).toMatch(ROWS_FILE_NAME)
    expect(file.rowCount).toBe(1)
    expect(file.truncated).toBe(false)
  })

  test("reads the list with the caller's filters, defaulting to posts that have comments", async () => {
    await channelPostExportService.build({
      ...rowsInput,
      filters: { channels: ["messenger"] },
      sort: "mostComments",
    })

    expect(mocks.listPosts).toHaveBeenCalledWith({
      cursor: undefined,
      filters: { channels: ["messenger"], hasComments: true },
      limit: 100,
      sort: "mostComments",
      workspaceId: "ws-1",
    })
  })

  test("neutralises a formula in the post text", async () => {
    mocks.listPosts.mockResolvedValue({
      items: [managedPost({ caption: '=HYPERLINK("x")' })],
    })

    const file = await channelPostExportService.build(rowsInput)

    expect(file.csv).toContain("\"'=HYPERLINK(")
  })

  test("pages through the list and stops flagged truncated at the row cap", async () => {
    mocks.listPosts.mockImplementation(({ limit }: { limit: number }) =>
      Promise.resolve({
        items: Array.from({ length: limit }, () => managedPost()),
        nextCursor: { id: "next", sort: "newest", sortValue: "x" },
      }),
    )

    const file = await channelPostExportService.build(rowsInput)

    expect(file.rowCount).toBe(MAX_EXPORT_POST_ROWS)
    expect(file.truncated).toBe(true)
    expect(mocks.listPosts).toHaveBeenCalledTimes(MAX_EXPORT_POST_ROWS / 100)
  })

  test("charges one message after the file is built and refuses when none is left", async () => {
    await channelPostExportService.build(rowsInput)
    expect(mocks.charge).toHaveBeenCalledWith({ count: 1, workspaceId: "ws-1" })

    vi.clearAllMocks()
    mocks.assertRoom.mockRejectedValue(new Error("postMessageQuotaExceeded"))
    await expect(channelPostExportService.build(rowsInput)).rejects.toThrow(
      "postMessageQuotaExceeded",
    )
    expect(mocks.listPosts).not.toHaveBeenCalled()
    expect(mocks.charge).not.toHaveBeenCalled()
  })

  test("a failed list read charges nothing", async () => {
    mocks.listPosts.mockRejectedValue(new Error("db down"))

    await expect(channelPostExportService.build(rowsInput)).rejects.toThrow(
      "db down",
    )

    expect(mocks.charge).not.toHaveBeenCalled()
  })

  test("post ids are refused for a rows export, and filters for a comments export", async () => {
    await expect(
      channelPostExportService.build({ ...rowsInput, postIds: ["p1"] }),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      channelPostExportService.build({ ...base, filters: { search: "x" } }),
    ).rejects.toMatchObject({ code: "validation" })

    expect(mocks.assertRoom).not.toHaveBeenCalled()
    expect(mocks.charge).not.toHaveBeenCalled()
  })
})
