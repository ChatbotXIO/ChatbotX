import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { API_URL } from "../src/constants"
import { postHandlers } from "../src/handlers/post"
import type { ThreadsAuthValue } from "../src/schema"

const POST_ID = "post-1"
const CONVERSATION_URL = `${API_URL}/v1.0/${POST_ID}/conversation`

const ctx = {
  auth: {
    tokens: { accessToken: "threads-token" },
    metadata: { threadsUserId: "u1", username: "shop", version: "v1.0" },
  } as ThreadsAuthValue,
} as never

const reply = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  text: `text ${id}`,
  timestamp: "2026-01-02T03:04:05+0000",
  username: "ann",
  replied_to: { id: POST_ID },
  is_reply_owned_by_me: false,
  hide_status: "NOT_HUSHED",
  ...extra,
})

const listComments = (cursor?: string) =>
  postHandlers.listComments?.({
    ctx,
    data: { postId: POST_ID, cursor },
  } as never)

describe("threads listComments", () => {
  test("maps replies at every depth with owner and hidden flags", async () => {
    server.use(
      http.get(CONVERSATION_URL, ({ request }) => {
        expect(new URL(request.url).searchParams.get("fields")).toContain(
          "hide_status",
        )
        return HttpResponse.json({
          data: [
            reply("r1", { hide_status: "HIDDEN" }),
            reply("r2", {
              replied_to: { id: "r1" },
              is_reply_owned_by_me: true,
            }),
          ],
        })
      }),
    )

    const page = await listComments()

    expect(page).toEqual({
      items: [
        {
          author: { id: null, name: "ann" },
          createdAt: new Date("2026-01-02T03:04:05+0000"),
          fromOwner: false,
          hidden: true,
          id: "r1",
          parentId: null,
          text: "text r1",
        },
        {
          author: { id: null, name: "ann" },
          createdAt: new Date("2026-01-02T03:04:05+0000"),
          fromOwner: true,
          hidden: false,
          id: "r2",
          parentId: "r1",
          text: "text r2",
        },
      ],
      nextCursor: null,
    })
  })

  test.each([
    ["HIDDEN", true],
    ["COVERED", true],
    ["NOT_HUSHED", false],
    ["UNHUSHED", false],
    ["BLOCKED", null],
    ["SOMETHING_NEW", null],
  ])("maps hide_status %s to hidden %s", async (status, hidden) => {
    server.use(
      http.get(CONVERSATION_URL, () =>
        HttpResponse.json({ data: [reply("r1", { hide_status: status })] }),
      ),
    )

    expect((await listComments())?.items[0]?.hidden).toBe(hidden)
  })

  test("rejects an invalid cursor as PAYLOAD_INVALID without calling Threads", async () => {
    const error = await Promise.resolve(
      listComments("raw-threads-cursor"),
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(ChannelError)
    expect((error as ChannelError).category).toBe(
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
  })

  test("returns an empty page when nobody replied", async () => {
    server.use(
      http.get(CONVERSATION_URL, () => HttpResponse.json({ data: [] })),
    )

    expect(await listComments()).toEqual({ items: [], nextCursor: null })
  })

  test("keeps unknown owner and hidden state as null", async () => {
    server.use(
      http.get(CONVERSATION_URL, () =>
        HttpResponse.json({
          data: [
            {
              id: "r1",
              timestamp: "2026-01-02T03:04:05+0000",
              replied_to: { id: POST_ID },
            },
          ],
        }),
      ),
    )

    const page = await listComments()

    expect(page?.items[0]).toMatchObject({
      fromOwner: null,
      hidden: null,
      text: "",
    })
  })

  test("pages with the Threads cursor to the end", async () => {
    server.use(
      http.get(CONVERSATION_URL, ({ request }) => {
        const after = new URL(request.url).searchParams.get("after")
        return after === "AFTER-1"
          ? HttpResponse.json({ data: [reply("r2")] })
          : HttpResponse.json({
              data: [reply("r1")],
              paging: { cursors: { after: "AFTER-1" }, next: "https://next" },
            })
      }),
    )

    const first = await listComments()
    const second = await listComments(first?.nextCursor ?? undefined)

    expect(first?.nextCursor).not.toBe("AFTER-1")
    expect(second?.items.map((item) => item.id)).toEqual(["r2"])
    expect(second?.nextCursor).toBeNull()
  })

  test("propagates a Threads error instead of returning a partial page", async () => {
    server.use(
      http.get(CONVERSATION_URL, () =>
        HttpResponse.json(
          { error: { message: "bad", code: 4 } },
          { status: 400 },
        ),
      ),
    )

    await expect(listComments()).rejects.toThrow()
  })
})
