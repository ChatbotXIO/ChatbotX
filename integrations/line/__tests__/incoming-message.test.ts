import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import {
  LINE_NOOP_POSTBACK_DATA,
  receiveMessage,
  replyTokenKey,
} from "../src/handlers/message/incoming-message"

const CHANNEL_MEDIA_KEY = /^public\/line\/ws-1\/int-1\/2026\/10\/06\//

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

const buildCtx = () => ({
  auth: {
    authType: "oauth2",
    clientId: "1",
    clientSecret: "s",
    redirectUrl: "",
    tokens: { accessToken: "tok" },
    metadata: { botUserId: "Ubot", basicId: "@bot" },
  },
  storagePrefix: "workspace-1",
  mediaStoragePrefix: "public/line/ws-1/int-1/2026/10/06",
  uploader: { putObject: vi.fn().mockResolvedValue(undefined) },
  ephemeral: {
    put: vi.fn().mockResolvedValue(undefined),
    take: vi.fn(),
  },
})

const run = (ctx: ReturnType<typeof buildCtx>, payload: unknown) =>
  receiveMessage({
    ctx: ctx as never,
    data: {
      integrationType: "line",
      integrationIdentifier: "chan-1",
      payload,
    },
  })

const messageEvent = (message: Record<string, unknown>, extra = {}) => ({
  type: "message",
  timestamp: 1,
  webhookEventId: "evt-1",
  source: { type: "user", userId: "U123" },
  replyToken: "reply-1",
  message,
  ...extra,
})

const CONTENT_URL = "https://api-data.line.me/v2/bot/message/:id/content"
const contentHandler = (type: string) =>
  http.get(CONTENT_URL, () =>
    HttpResponse.arrayBuffer(new Uint8Array([0xff, 0xd8, 1, 2]).buffer, {
      headers: { "Content-Type": type },
    }),
  )

describe("replyTokenKey", () => {
  test("namespaces by user id", () => {
    expect(replyTokenKey("U1")).toBe("replyToken:U1")
  })
})

describe("receiveMessage", () => {
  test("maps text", async () => {
    const result = await run(
      buildCtx(),
      messageEvent({ id: "m1", type: "text", text: "hello" }),
    )
    expect(result.contact.sourceId).toBe("U123")
    expect(result.message?.sourceId).toBe("m1")
    expect(result.message?.text).toBe("hello")
    expect(result.message?.attachments).toEqual([])
    expect(result.postbackAction).toBeNull()
  })

  test("carries LINE's event time as occurredAt", async () => {
    const result = await run(
      buildCtx(),
      messageEvent(
        { id: "m1", type: "text", text: "hello" },
        { timestamp: 1_767_225_600_000 },
      ),
    )
    expect(result.occurredAt).toEqual(new Date(1_767_225_600_000))
  })

  test("downloads LINE-hosted image from api-data and stores it", async () => {
    server.use(contentHandler("image/jpeg"))
    const ctx = buildCtx()
    const result = await run(
      ctx,
      messageEvent({
        id: "m2",
        type: "image",
        contentProvider: { type: "line" },
      }),
    )
    expect(result.message?.attachments).toEqual([
      expect.objectContaining({ fileType: "image", mimeType: "image/jpeg" }),
    ])
    expect(ctx.uploader.putObject).toHaveBeenCalledTimes(1)
    expect(ctx.uploader.putObject.mock.calls[0]?.[0]).toMatch(CHANNEL_MEDIA_KEY)
  })

  test("uses originalContentUrl for external image without fetching", async () => {
    const ctx = buildCtx()
    const result = await run(
      ctx,
      messageEvent({
        id: "m3",
        type: "image",
        contentProvider: {
          type: "external",
          originalContentUrl: "https://cdn.example.com/a.png",
        },
      }),
    )
    expect(result.message?.attachments).toEqual([
      expect.objectContaining({
        fileType: "image",
        url: "https://cdn.example.com/a.png",
        originPath: "https://cdn.example.com/a.png",
      }),
    ])
    expect(ctx.uploader.putObject).not.toHaveBeenCalled()
  })

  test.each([
    ["video", "video", "video/mp4"],
    ["audio", "audio", "audio/mp4"],
  ])("stores %s with original profile", async (type, fileType, mimeType) => {
    server.use(contentHandler("application/octet-stream"))
    const ctx = buildCtx()
    const result = await run(
      ctx,
      messageEvent({ id: "m4", type, contentProvider: { type: "line" } }),
    )
    expect(result.message?.attachments).toEqual([
      expect.objectContaining({ fileType, mimeType }),
    ])
    expect(ctx.uploader.putObject).toHaveBeenCalledTimes(1)
  })

  test("stores file with its name", async () => {
    server.use(contentHandler("application/octet-stream"))
    const ctx = buildCtx()
    const result = await run(
      ctx,
      messageEvent({
        id: "m5",
        type: "file",
        fileName: "doc.pdf",
        fileSize: 4,
      }),
    )
    expect(result.message?.attachments).toEqual([
      expect.objectContaining({
        fileType: "file",
        name: "doc.pdf",
        mimeType: "application/pdf",
      }),
    ])
  })

  test("maps location", async () => {
    const result = await run(
      buildCtx(),
      messageEvent({
        id: "m6",
        type: "location",
        title: "Home",
        address: "1 Main St",
        latitude: 35.1,
        longitude: 139.2,
      }),
    )
    expect(result.message?.contentType).toBe("location")
    expect(result.message?.text).toBe("Home 1 Main St (35.1,139.2)")
    expect(result.message?.contentAttributes).toEqual({
      latitude: "35.1",
      longitude: "139.2",
    })
  })

  test("maps sticker to placeholder text", async () => {
    const result = await run(
      buildCtx(),
      messageEvent({
        id: "m7",
        type: "sticker",
        packageId: "11537",
        stickerId: "52002734",
      }),
    )
    expect(result.message?.text).toBe("[sticker 11537/52002734]")
  })

  test("maps postback data to postbackAction", async () => {
    const result = await run(buildCtx(), {
      type: "postback",
      source: { type: "user", userId: "U123" },
      replyToken: "reply-2",
      webhookEventId: "evt-2",
      postback: { data: "payload-xyz" },
    })
    expect(result.postbackAction).toBe("payload-xyz")
    expect(result.contact.sourceId).toBe("U123")
  })

  test("stashes the reply token with a 5 min TTL", async () => {
    const ctx = buildCtx()
    await run(ctx, messageEvent({ id: "m8", type: "text", text: "hi" }))
    expect(ctx.ephemeral.put).toHaveBeenCalledWith(
      replyTokenKey("U123"),
      "reply-1",
      300,
    )
  })

  test("does not stash a redelivered event's stale token", async () => {
    const ctx = buildCtx()
    await run(
      ctx,
      messageEvent(
        { id: "m9", type: "text", text: "hi" },
        { deliveryContext: { isRedelivery: true } },
      ),
    )
    expect(ctx.ephemeral.put).not.toHaveBeenCalled()
  })

  test("a failing reply-token stash never drops the inbound message", async () => {
    const ctx = buildCtx()
    ctx.ephemeral.put.mockRejectedValueOnce(new Error("redis down"))
    const result = await run(
      ctx,
      messageEvent({ id: "m10", type: "text", text: "still here" }),
    )
    expect(ctx.ephemeral.put).toHaveBeenCalledTimes(1)
    expect(result?.message?.text).toBe("still here")
  })

  test("ignores a tap on a pre-Flex carousel padding (no-op) button", async () => {
    // Already-delivered messages carry this exact value; it must never change.
    expect(LINE_NOOP_POSTBACK_DATA).toBe("line:noop")
    const result = await run(buildCtx(), {
      type: "postback",
      timestamp: 1,
      webhookEventId: "evt-noop",
      source: { type: "user", userId: "U123" },
      replyToken: "reply-1",
      postback: { data: LINE_NOOP_POSTBACK_DATA },
    })
    expect(result).toBeNull()
  })

  test("rejects an event without a user source", async () => {
    await expect(
      run(buildCtx(), {
        type: "message",
        source: { type: "group", groupId: "G1" },
        message: { id: "m", type: "text", text: "x" },
      }),
    ).rejects.toThrow()
  })
})
