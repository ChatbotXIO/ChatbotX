import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/lib/http-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/http-client")>()),
  facebookGraphClient: { getWithHeaders: vi.fn() },
}))

const { postHandlers } = await import("../src/handlers/post")
const { facebookGraphClient } = await import("../src/lib/http-client")

const get = facebookGraphClient.getWithHeaders as ReturnType<typeof vi.fn>

const ctx = {
  auth: { metadata: { pageId: "page-1" }, tokens: { accessToken: "token" } },
} as never

const comment = (overrides: Record<string, unknown> = {}) => ({
  id: "c1",
  message: "hello",
  created_time: "2026-01-02T03:04:05+0000",
  from: { id: "user-1", name: "Ann" },
  ...overrides,
})

/** A Graph answer as `getWithHeaders` returns it. */
const answer = (data: unknown, headers: Record<string, string> = {}) => ({
  data,
  headers: new Headers(headers),
})

const listComments = (cursor?: string) =>
  postHandlers.listComments?.({
    ctx,
    data: { postId: "page-1_post-1", cursor },
  } as never)

beforeEach(() => {
  get.mockReset()
})

describe("messenger listComments", () => {
  test("maps a top-level comment and a reply, flagging the page's own", async () => {
    get.mockResolvedValueOnce(
      answer({
        data: [
          comment(),
          comment({
            id: "c2",
            parent: { id: "c1" },
            from: { id: "page-1", name: "Shop" },
            is_hidden: true,
          }),
        ],
      }),
    )

    const page = await listComments()

    expect(page).toEqual({
      items: [
        {
          author: { id: "user-1", name: "Ann" },
          createdAt: new Date("2026-01-02T03:04:05+0000"),
          fromOwner: false,
          hidden: null,
          id: "c1",
          parentId: null,
          text: "hello",
        },
        {
          author: { id: "page-1", name: "Shop" },
          createdAt: new Date("2026-01-02T03:04:05+0000"),
          fromOwner: true,
          hidden: true,
          id: "c2",
          parentId: "c1",
          text: "hello",
        },
      ],
      nextCursor: null,
      pauseMs: null,
    })
    expect(get.mock.calls[0][1].searchParams).toMatchObject({
      filter: "stream",
      fields: expect.stringContaining("is_hidden"),
    })
  })

  test("returns an empty page for a post without comments", async () => {
    get.mockResolvedValueOnce(answer({ data: [] }))

    expect(await listComments()).toEqual({
      items: [],
      nextCursor: null,
      pauseMs: null,
    })
  })

  test("pages with the Graph cursor until the last page", async () => {
    get
      .mockResolvedValueOnce(
        answer({
          data: [comment()],
          paging: { cursors: { after: "AFTER-1" }, next: "https://next" },
        }),
      )
      .mockResolvedValueOnce(answer({ data: [comment({ id: "c9" })] }))

    const first = await listComments()
    const second = await listComments(first?.nextCursor ?? undefined)

    expect(first?.nextCursor).not.toBe("AFTER-1")
    expect(get.mock.calls[1][1].searchParams).toMatchObject({
      after: "AFTER-1",
    })
    expect(second?.nextCursor).toBeNull()
  })

  test("rejects an invalid cursor as PAYLOAD_INVALID without calling Graph", async () => {
    const error = await listComments("raw-graph-cursor").catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(ChannelError)
    expect((error as ChannelError).category).toBe(
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
    expect(get).not.toHaveBeenCalled()
  })

  test("keeps unknown author, owner and text as null or empty", async () => {
    get.mockResolvedValueOnce(
      answer({
        data: [{ id: "c3", created_time: "2026-01-02T03:04:05+0000" }],
      }),
    )

    const page = await listComments()

    expect(page?.items[0]).toMatchObject({
      author: { id: null, name: null },
      fromOwner: null,
      text: "",
    })
  })

  test("passes the pause the usage headers ask for, the longest regain time in minutes", async () => {
    get.mockResolvedValueOnce(
      answer(
        { data: [comment()] },
        {
          "x-business-use-case-usage": JSON.stringify({
            "1": [{ call_count: 100, estimated_time_to_regain_access: 2 }],
          }),
        },
      ),
    )

    expect((await listComments())?.pauseMs).toBe(120_000)
  })

  test("asks for no pause while the usage has room", async () => {
    get.mockResolvedValueOnce(
      answer(
        { data: [comment()] },
        { "x-app-usage": JSON.stringify({ call_count: 10 }) },
      ),
    )

    expect((await listComments())?.pauseMs).toBeNull()
  })

  test("propagates a Graph error instead of returning a partial page", async () => {
    get.mockRejectedValueOnce(new Error("rate limited"))

    await expect(listComments()).rejects.toThrow()
  })
})
