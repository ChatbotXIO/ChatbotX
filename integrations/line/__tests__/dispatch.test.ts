import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { LineAPIException } from "../src/exception"
import { replyTokenKey } from "../src/handlers/message/incoming-message"
import {
  sendFlowStep,
  sendMessage,
} from "../src/handlers/message/outgoing-message"
import {
  dispatchLineMessages,
  type LineMessage,
} from "../src/handlers/message/outgoing-message/dispatch"
import {
  SEND_CHECKPOINT_TTL_SECONDS,
  sendCheckpointKey,
} from "../src/handlers/message/outgoing-message/send-checkpoint"
import { mapToChannelError } from "../src/lib/error-mapper"

const mediaMocks = vi.hoisted(() => {
  class OutboundMediaError extends Error {
    readonly retryable: boolean
    constructor(message: string, retryable: boolean) {
      super(message)
      this.retryable = retryable
    }
  }
  return {
    OutboundMediaError,
    resolveImage: vi.fn(),
    resolveVideoPreview: vi.fn(),
  }
})

vi.mock("@chatbotx.io/business/outbound-media", () => ({
  OutboundMediaError: mediaMocks.OutboundMediaError,
  resolveOutboundImageRenditions: mediaMocks.resolveImage,
  resolveVideoPreviewPlaceholderUrl: mediaMocks.resolveVideoPreview,
}))

const URL_REPLY = "https://api.line.me/v2/bot/message/reply"
const URL_PUSH = "https://api.line.me/v2/bot/message/push"
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

beforeEach(() => {
  mediaMocks.resolveImage.mockReset()
  mediaMocks.resolveImage.mockImplementation(
    async ({ url }: { url: string }) => ({
      originalUrl: url,
      previewUrl: `${url}#preview`,
    }),
  )
  mediaMocks.resolveVideoPreview.mockReset()
  mediaMocks.resolveVideoPreview.mockResolvedValue(
    "https://cdn.test/video-preview.jpg",
  )
})

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

type Call = {
  url: string
  body: { to?: string; replyToken?: string; messages: LineMessage[] }
  retryKey: string | null
}

/** A tiny in-memory stand-in for the Redis GETDEL-backed ephemeral store. */
const buildCtx = (stash: Record<string, string> = {}) => {
  const store = new Map(Object.entries(stash))
  return {
    auth: {
      authType: "oauth2",
      clientId: "1",
      clientSecret: "s",
      redirectUrl: "",
      tokens: { accessToken: "tok" },
      metadata: { botUserId: "Ubot", basicId: "@bot" },
    },
    storagePrefix: "workspace-1",
    platform: { storageUrl: "https://cdn.test/bucket" },
    ephemeral: {
      store,
      put: vi.fn((key: string, value: string, _ttlSeconds: number) => {
        store.set(key, value)
        return Promise.resolve()
      }),
      take: vi.fn((key: string) => {
        const value = store.get(key) ?? null
        store.delete(key)
        return Promise.resolve(value)
      }),
    },
  }
}

const record = (
  calls: Call[],
  overrides: {
    reply?: () => Response
    /** Called with the 1-based push count; undefined means a normal success. */
    push?: (pushNumber: number) => Response | undefined
  } = {},
) => {
  let pushes = 0
  const capture =
    (url: string, respond?: () => Response | undefined) =>
    async ({ request }: { request: Request }) => {
      calls.push({
        url,
        body: (await request.json()) as Call["body"],
        retryKey: request.headers.get("x-line-retry-key"),
      })
      return (
        respond?.() ??
        HttpResponse.json({ sentMessages: [{ id: `id-${calls.length}` }] })
      )
    }
  server.use(
    http.post(URL_REPLY, capture(URL_REPLY, overrides.reply)),
    http.post(
      URL_PUSH,
      capture(URL_PUSH, () => {
        pushes += 1
        return overrides.push?.(pushes)
      }),
    ),
  )
}

/** A 429 that is not the monthly limit: a retryable RATE_LIMITED error. */
const rateLimited = () =>
  HttpResponse.json({ message: "Too many requests" }, { status: 429 })

/** Fails the given 1-based push numbers with a retryable 429. */
const failPushes =
  (...numbers: number[]) =>
  (pushNumber: number) =>
    numbers.includes(pushNumber) ? rateLimited() : undefined

const texts = (n: number): LineMessage[] =>
  Array.from({ length: n }, (_, i) => ({ type: "text", text: `m${i}` }))

const SEND_ID = "msg-1"

/** A send with an id, as `sendMessage` makes one (the `Message` row id). */
const dispatch = (
  ctx: ReturnType<typeof buildCtx>,
  messages: LineMessage[],
  sendId = SEND_ID,
) => dispatchLineMessages(ctx as never, "U1", messages, sendId)

describe("dispatchLineMessages", () => {
  test("uses the stored reply token and does not push", async () => {
    const calls: Call[] = []
    record(calls)
    const ctx = buildCtx({ [replyTokenKey("U1")]: "rt-1" })

    const result = await dispatch(ctx, texts(2))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(URL_REPLY)
    expect(calls[0]?.body).toEqual({ replyToken: "rt-1", messages: texts(2) })
    expect(calls[0]?.retryKey).toBeNull()
    expect(ctx.ephemeral.take).toHaveBeenCalledWith(replyTokenKey("U1"))
    expect(result.sentCount).toBe(2)
    expect(result.messageIds).toEqual(["id-1"])
  })

  test("pushes with a UUID retry key when no token is stored", async () => {
    const calls: Call[] = []
    record(calls)

    await dispatch(buildCtx(), texts(1))

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(URL_PUSH)
    expect(calls[0]?.body).toEqual({ to: "U1", messages: texts(1) })
    expect(calls[0]?.retryKey).toMatch(UUID_PATTERN)
  })

  test("pushes when the context has no ephemeral store", async () => {
    const calls: Call[] = []
    record(calls)
    const { ephemeral: _omit, ...ctx } = buildCtx()

    await dispatchLineMessages(ctx as never, "U1", texts(1))

    expect(calls.map((c) => c.url)).toEqual([URL_PUSH])
  })

  test("replies with the first 5 and pushes the rest", async () => {
    const calls: Call[] = []
    record(calls)
    const messages = texts(7)

    const result = await dispatch(
      buildCtx({ [replyTokenKey("U1")]: "rt-1" }),
      messages,
    )

    expect(calls.map((c) => c.url)).toEqual([URL_REPLY, URL_PUSH])
    expect(calls[0]?.body.messages).toEqual(messages.slice(0, 5))
    expect(calls[1]?.body.messages).toEqual(messages.slice(5))
    expect(calls[1]?.retryKey).toMatch(UUID_PATTERN)
    expect(result.messageIds).toEqual(["id-1", "id-2"])
  })

  test("uses a fresh retry key for every push batch", async () => {
    const calls: Call[] = []
    record(calls)

    await dispatch(buildCtx(), texts(11))

    expect(calls.map((c) => c.url)).toEqual([URL_PUSH, URL_PUSH, URL_PUSH])
    expect(new Set(calls.map((c) => c.retryKey)).size).toBe(3)
  })

  test("re-sends as push when LINE rejects the reply token", async () => {
    const calls: Call[] = []
    record(calls, {
      reply: () =>
        HttpResponse.json({ message: "Invalid reply token" }, { status: 400 }),
    })

    const result = await dispatch(
      buildCtx({ [replyTokenKey("U1")]: "stale" }),
      texts(2),
    )

    expect(calls.map((c) => c.url)).toEqual([URL_REPLY, URL_PUSH])
    expect(calls[1]?.body).toEqual({ to: "U1", messages: texts(2) })
    expect(calls[1]?.retryKey).toMatch(UUID_PATTERN)
    expect(result.messageIds).toEqual(["id-2"])
  })

  test("a reply 5xx throws a retryable ChannelError and never pushes", async () => {
    const calls: Call[] = []
    record(calls, {
      reply: () => HttpResponse.json({ message: "boom" }, { status: 500 }),
    })

    const error = await dispatch(
      buildCtx({ [replyTokenKey("U1")]: "rt-1" }),
      texts(1),
    ).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ChannelError)
    expect([
      ChannelErrorCategory.NETWORK_ERROR,
      ChannelErrorCategory.UNKNOWN,
    ]).toContain((error as ChannelError).category)
    // The reply has no retry key, so ky must not retry it either.
    expect(calls.map((c) => c.url)).toEqual([URL_REPLY])
  })

  test("a non-token reply 400 throws without pushing", async () => {
    const calls: Call[] = []
    record(calls, {
      reply: () =>
        HttpResponse.json(
          { message: "The request body has 1 error(s)" },
          {
            status: 400,
          },
        ),
    })

    await expect(
      dispatch(buildCtx({ [replyTokenKey("U1")]: "rt-1" }), texts(1)),
    ).rejects.toBeInstanceOf(ChannelError)
    expect(calls.map((c) => c.url)).toEqual([URL_REPLY])
  })

  test("the token is single-use: a second send after one stash pushes", async () => {
    const calls: Call[] = []
    record(calls)
    const ctx = buildCtx({ [replyTokenKey("U1")]: "rt-1" })

    await dispatch(ctx, texts(1))
    await dispatch(ctx, texts(1))

    expect(calls.map((c) => c.url)).toEqual([URL_REPLY, URL_PUSH])
  })

  test("falls back to push when taking the token fails", async () => {
    const calls: Call[] = []
    record(calls)
    const ctx = buildCtx()
    ctx.ephemeral.take.mockRejectedValueOnce(new Error("redis down"))

    await dispatch(ctx, texts(1))

    expect(calls.map((c) => c.url)).toEqual([URL_PUSH])
  })

  test("sends nothing and keeps the token for an empty batch", async () => {
    const calls: Call[] = []
    record(calls)
    const ctx = buildCtx({ [replyTokenKey("U1")]: "rt-1" })

    const result = await dispatch(ctx, [])

    expect(calls).toHaveLength(0)
    expect(ctx.ephemeral.take).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: [], sentCount: 0 })
  })
})

describe("dispatchLineMessages send checkpoint", () => {
  // dispatch rethrows LINE's own error unchanged; the send handler maps it.
  const isRateLimited = (error: unknown) =>
    error instanceof LineAPIException &&
    mapToChannelError(error).category === ChannelErrorCategory.RATE_LIMITED

  test("a later batch failure is checkpointed and the retry skips sent batches", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()
    const messages = texts(11)
    const key = await sendCheckpointKey("U1", SEND_ID, messages)

    const error = await dispatch(ctx, messages).catch((e: unknown) => e)

    expect(isRateLimited(error)).toBe(true)
    expect(ctx.ephemeral.put).toHaveBeenCalledTimes(1)
    expect(ctx.ephemeral.put).toHaveBeenCalledWith(
      key,
      expect.any(String),
      SEND_CHECKPOINT_TTL_SECONDS,
    )
    expect(JSON.parse(ctx.ephemeral.store.get(key as string) ?? "")).toEqual({
      completedBatches: 1,
      messageIds: ["id-1"],
      sentCount: 5,
    })

    const result = await dispatch(ctx, messages)

    // Batch 1 is not re-sent: the retry pushes batches 2 and 3 only.
    expect(calls.slice(2).map((c) => c.body.messages)).toEqual([
      messages.slice(5, 10),
      messages.slice(10),
    ])
    expect(result).toEqual({
      messageIds: ["id-1", "id-3", "id-4"],
      sentCount: 11,
    })
    expect(ctx.ephemeral.store.has(key as string)).toBe(false)
    expect(ctx.ephemeral.put).toHaveBeenCalledTimes(1)

    // The checkpoint is gone, so an identical later send goes out in full.
    await dispatch(ctx, messages)
    expect(calls.slice(4).map((c) => c.body.messages)).toEqual([
      messages.slice(0, 5),
      messages.slice(5, 10),
      messages.slice(10),
    ])
  })

  test("a reply-sent first batch is not re-sent on retry", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(1) })
    const ctx = buildCtx({ [replyTokenKey("U1")]: "rt-1" })
    const messages = texts(7)

    await expect(dispatch(ctx, messages)).rejects.toSatisfy(isRateLimited)
    const result = await dispatch(ctx, messages)

    expect(calls.map((c) => c.url)).toEqual([URL_REPLY, URL_PUSH, URL_PUSH])
    expect(calls[2]?.body.messages).toEqual(messages.slice(5))
    expect(result).toEqual({ messageIds: ["id-1", "id-3"], sentCount: 7 })
  })

  test("a first-batch failure writes no checkpoint", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(1) })
    const ctx = buildCtx()

    await expect(dispatch(ctx, texts(11))).rejects.toSatisfy(isRateLimited)

    expect(calls).toHaveLength(1)
    expect(ctx.ephemeral.put).not.toHaveBeenCalled()
    expect(ctx.ephemeral.store.size).toBe(0)
  })

  test("a single-batch send never touches the checkpoint", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()

    await dispatch(ctx, texts(5))
    await expect(dispatch(ctx, texts(3))).rejects.toSatisfy(isRateLimited)

    expect(ctx.ephemeral.put).not.toHaveBeenCalled()
    // The only takes are the reply-token lookups.
    expect(ctx.ephemeral.take.mock.calls).toEqual([
      [replyTokenKey("U1")],
      [replyTokenKey("U1")],
    ])
  })

  test("different messages or a different recipient do not resume it", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()
    const messages = texts(11)
    const key = await sendCheckpointKey("U1", SEND_ID, messages)

    await expect(dispatch(ctx, messages)).rejects.toSatisfy(isRateLimited)
    const otherMessages = [
      ...messages.slice(0, 10),
      { type: "text", text: "x" },
    ]
    await dispatch(ctx, otherMessages)
    await dispatchLineMessages(ctx as never, "U2", messages, SEND_ID)

    // Both sends went out in full (3 batches each) after the 2 initial pushes.
    expect(calls).toHaveLength(8)
    expect(calls.slice(2, 5).map((c) => c.body.messages)).toEqual([
      otherMessages.slice(0, 5),
      otherMessages.slice(5, 10),
      otherMessages.slice(10),
    ])
    expect(calls.slice(5).map((c) => c.body.to)).toEqual(["U2", "U2", "U2"])
    // The original send's checkpoint is still there for its own retry.
    expect(ctx.ephemeral.store.has(key as string)).toBe(true)
  })

  test("a failing checkpoint lookup falls back to sending everything", async () => {
    const calls: Call[] = []
    record(calls)
    const messages = texts(11)
    const key = await sendCheckpointKey("U1", SEND_ID, messages)
    const ctx = buildCtx({
      [key as string]: JSON.stringify({
        completedBatches: 1,
        messageIds: ["old"],
        sentCount: 5,
      }),
    })
    ctx.ephemeral.take.mockRejectedValueOnce(new Error("redis down"))

    const result = await dispatch(ctx, messages)

    expect(calls).toHaveLength(3)
    expect(result).toEqual({
      messageIds: ["id-1", "id-2", "id-3"],
      sentCount: 11,
    })
  })

  test("a failing checkpoint save still rethrows the original send error", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()
    ctx.ephemeral.put.mockRejectedValueOnce(new Error("redis down"))

    await expect(dispatch(ctx, texts(11))).rejects.toSatisfy(isRateLimited)

    expect(ctx.ephemeral.put).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
  })

  test("without an ephemeral store a multi-batch failure still rethrows", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const { ephemeral: _omit, ...ctx } = buildCtx()

    await expect(
      dispatchLineMessages(ctx as never, "U1", texts(11)),
    ).rejects.toSatisfy(isRateLimited)
    expect(calls).toHaveLength(2)
  })

  test("a resumed send leaves the reply token for a later send", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()
    const messages = texts(11)

    await expect(dispatch(ctx, messages)).rejects.toSatisfy(isRateLimited)
    ctx.ephemeral.store.set(replyTokenKey("U1"), "rt-1")
    ctx.ephemeral.take.mockClear()
    await dispatch(ctx, messages)

    expect(calls.map((c) => c.url)).toEqual([
      URL_PUSH,
      URL_PUSH,
      URL_PUSH,
      URL_PUSH,
    ])
    expect(ctx.ephemeral.take).not.toHaveBeenCalledWith(replyTokenKey("U1"))
    expect(ctx.ephemeral.store.get(replyTokenKey("U1"))).toBe("rt-1")
  })

  test("a new send of the same content does not resume a dead send's checkpoint", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()
    const messages = texts(11)
    const key = await sendCheckpointKey("U1", SEND_ID, messages)

    await expect(dispatch(ctx, messages)).rejects.toSatisfy(isRateLimited)
    const result = await dispatch(ctx, messages, "msg-2")

    // The new send delivers every batch, batch 1 included.
    expect(calls.slice(2).map((c) => c.body.messages)).toEqual([
      messages.slice(0, 5),
      messages.slice(5, 10),
      messages.slice(10),
    ])
    expect(result.sentCount).toBe(11)
    // The dead send's checkpoint is untouched; only its own retry takes it.
    expect(ctx.ephemeral.store.has(key as string)).toBe(true)
  })

  test("a send without an id never writes or reads a checkpoint", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()
    const messages = texts(11)

    await expect(
      dispatchLineMessages(ctx as never, "U1", messages),
    ).rejects.toSatisfy(isRateLimited)
    await dispatchLineMessages(ctx as never, "U1", messages)

    expect(ctx.ephemeral.put).not.toHaveBeenCalled()
    // Both sends went out from the first batch.
    expect(calls.slice(2).map((c) => c.body.messages)).toEqual([
      messages.slice(0, 5),
      messages.slice(5, 10),
      messages.slice(10),
    ])
  })

  test.each([
    ["not JSON", "{oops"],
    ["a wrong shape", JSON.stringify({ completedBatches: "1" })],
    [
      "every batch completed",
      JSON.stringify({ completedBatches: 3, messageIds: [], sentCount: 15 }),
    ],
    [
      "a sent count that is not whole batches",
      JSON.stringify({ completedBatches: 1, messageIds: [], sentCount: 4 }),
    ],
  ])("a corrupt checkpoint (%s) is ignored", async (_label, value) => {
    const calls: Call[] = []
    record(calls)
    const messages = texts(11)
    const key = await sendCheckpointKey("U1", SEND_ID, messages)
    const ctx = buildCtx({ [key as string]: value })

    const result = await dispatch(ctx, messages)

    expect(calls).toHaveLength(3)
    expect(result.sentCount).toBe(11)
    expect(ctx.ephemeral.store.has(key as string)).toBe(false)
  })
})

describe("sendFlowStep / sendMessage", () => {
  test("sendFlowStep converts, attaches canonical quick replies and pushes", async () => {
    const calls: Call[] = []
    record(calls)

    const result = await sendFlowStep({
      ctx: buildCtx() as never,
      data: {
        contact: { id: "c1", sourceId: "U1" },
        flowId: "100",
        step: { id: "s", stepType: "sendText", text: "hi", buttons: [] },
        quickReplies: [
          { id: "q", label: "Go", buttonType: "postback", postback: "pb" },
        ],
      },
    } as never)

    expect(calls).toHaveLength(1)
    expect(calls[0]?.body.messages).toEqual([
      {
        type: "text",
        text: "hi",
        quickReply: {
          items: [
            {
              type: "action",
              action: {
                type: "postback",
                label: "Go",
                data: "pb",
                displayText: "Go",
              },
            },
          ],
        },
      },
    ])
    expect(result).toEqual({ messageIds: ["id-1"], sentCount: 1 })
  })

  test("sendMessage sends text then attachments", async () => {
    const calls: Call[] = []
    record(calls)

    await sendMessage({
      ctx: buildCtx() as never,
      data: {
        contact: { id: "c1", sourceId: "U1" },
        message: {
          contentType: "text",
          text: "hello",
          attachments: [
            { fileType: "image", url: "https://x.io/a.png" },
            { fileType: "file", url: "https://x.io/a.pdf" },
          ],
        },
      },
    } as never)

    expect(calls[0]?.body.messages).toEqual([
      { type: "text", text: "hello" },
      {
        type: "image",
        originalContentUrl: "https://x.io/a.png",
        previewImageUrl: "https://x.io/a.png#preview",
      },
      { type: "text", text: "https://x.io/a.pdf" },
    ])
  })

  test("an image that cannot be made to fit fails the send with a typed error and sends nothing", async () => {
    const calls: Call[] = []
    record(calls)
    mediaMocks.resolveImage.mockRejectedValue(
      new mediaMocks.OutboundMediaError(
        "The file is not a readable image",
        false,
      ),
    )

    const error = await sendFlowStep({
      ctx: buildCtx() as never,
      data: {
        contact: { id: "c1", sourceId: "U1" },
        flowId: "100",
        step: {
          id: "s",
          stepType: "sendImage",
          url: "https://x.io/a.png",
          buttons: [],
        },
      },
    } as never).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ChannelError)
    expect((error as ChannelError).category).toBe(
      ChannelErrorCategory.PAYLOAD_INVALID,
    )
    expect(calls).toHaveLength(0)
  })

  test("a video gets a hosted image as its preview, never the video itself", async () => {
    const calls: Call[] = []
    record(calls)

    await sendFlowStep({
      ctx: buildCtx() as never,
      data: {
        contact: { id: "c1", sourceId: "U1" },
        flowId: "100",
        step: {
          id: "s",
          stepType: "sendVideo",
          url: "https://x.io/a.mp4",
          buttons: [],
        },
      },
    } as never)

    expect(calls[0]?.body.messages).toEqual([
      {
        type: "video",
        originalContentUrl: "https://x.io/a.mp4",
        previewImageUrl: "https://cdn.test/video-preview.jpg",
      },
    ])
  })

  test("a push failure surfaces as a ChannelError", async () => {
    server.use(
      http.post(URL_PUSH, () =>
        HttpResponse.json(
          { message: "You have reached your monthly limit." },
          {
            status: 429,
          },
        ),
      ),
    )

    const error = await sendMessage({
      ctx: buildCtx() as never,
      data: {
        contact: { id: "c1", sourceId: "U1" },
        message: { contentType: "text", text: "x", attachments: [] },
      },
    } as never).catch((e: unknown) => e)

    expect((error as ChannelError).category).toBe(
      ChannelErrorCategory.QUOTA_EXCEEDED,
    )
  })

  test("sendMessage checkpoints by the message id so its retry resumes", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()
    const urls = Array.from({ length: 6 }, (_, i) => `https://x.io/${i}.pdf`)
    const send = () =>
      sendMessage({
        ctx: ctx as never,
        data: {
          contact: { id: "c1", sourceId: "U1" },
          message: {
            id: "msg-9",
            contentType: "text",
            text: null,
            attachments: urls.map((url) => ({ fileType: "file", url })),
          },
        },
      } as never)

    await expect(send()).rejects.toBeInstanceOf(ChannelError)
    await send()

    // The retry pushes only the second batch.
    expect(calls).toHaveLength(3)
    expect(calls[2]?.body.messages).toEqual([{ type: "text", text: urls[5] }])
  })

  test("sendFlowStep writes no checkpoint (a failed step is never retried)", async () => {
    const calls: Call[] = []
    record(calls, { push: failPushes(2) })
    const ctx = buildCtx()

    await expect(
      sendFlowStep({
        ctx: ctx as never,
        data: {
          contact: { id: "c1", sourceId: "U1" },
          flowId: "100",
          step: {
            id: "s",
            stepType: "sendMultipleImages",
            images: Array.from({ length: 7 }, (_, i) => ({
              url: `https://x.io/${i}.png`,
            })),
          },
        },
      } as never),
    ).rejects.toBeInstanceOf(ChannelError)

    expect(calls).toHaveLength(2)
    expect(ctx.ephemeral.put).not.toHaveBeenCalled()
  })
})
