import { createHmac } from "node:crypto"
import type { EchoCollectorPort, HandleRequestProps } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { logger } from "../src/lib/logger"
import { MESSENGER_MESSAGE_METADATA, type MessengerConfig } from "../src/schema"

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

const CLIENT_SECRET = "test-client-secret"
const PAGE_ID = "page-1"

const config = {
  clientSecret: CLIENT_SECRET,
  verifyToken: "verify-token",
} as unknown as MessengerConfig

const sign = (body: string): string =>
  `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`

const buildEvent = (overrides: Record<string, unknown> = {}) => ({
  sender: { id: PAGE_ID },
  recipient: { id: "psid-1" },
  timestamp: 1_700_000_000_000,
  message: { mid: "mid-1", text: "hello", is_echo: true },
  ...overrides,
})

const buildBody = (messaging: unknown[]): string =>
  JSON.stringify({
    object: "page",
    entry: [{ id: PAGE_ID, time: 1_700_000_000, messaging }],
  })

const makeProps = (
  body: string,
  queue: { add: ReturnType<typeof vi.fn> },
  echoCollector?: EchoCollectorPort,
): HandleRequestProps<MessengerConfig> => ({
  config,
  req: new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": sign(body) },
    body,
  }),
  queue: queue as never,
  echoCollector,
})

describe("Messenger webhook echo collector", () => {
  let queue: { add: ReturnType<typeof vi.fn> }
  let collector: EchoCollectorPort & {
    push: ReturnType<typeof vi.fn>
    schedule: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queue = { add: vi.fn().mockResolvedValue(undefined) }
    collector = {
      push: vi.fn().mockResolvedValue({ accepted: true }),
      schedule: vi.fn().mockResolvedValue(undefined),
    }
  })

  test("pushes a plain echo and schedules its page without enqueuing the legacy job", async () => {
    const event = buildEvent({
      message: {
        mid: "mid-1",
        text: "hello",
        is_echo: true,
        app_id: 123,
        attachments: [
          { type: "image", payload: { url: "https://cdn.test/image.png" } },
        ],
      },
    })
    const body = buildBody([event])

    await webhookHandler(makeProps(body, queue, collector))

    expect(collector.push).toHaveBeenCalledExactlyOnceWith({
      channel: "messenger",
      identifier: PAGE_ID,
      item: {
        entryId: PAGE_ID,
        entryTime: 1_700_000_000,
        messaging: event,
      },
    })
    expect(collector.schedule).toHaveBeenCalledExactlyOnceWith({
      channel: "messenger",
      identifier: PAGE_ID,
    })
    expect(queue.add).not.toHaveBeenCalled()
  })

  test("uses the unchanged incomingMessage path when no collector is provided", async () => {
    const event = buildEvent()
    const body = buildBody([event])

    await webhookHandler(makeProps(body, queue))

    expect(queue.add).toHaveBeenCalledExactlyOnceWith("incomingMessage", {
      type: "incomingMessage",
      data: {
        integrationType: "messenger",
        integrationIdentifier: PAGE_ID,
        payload: {
          object: "page",
          entry: [
            {
              id: PAGE_ID,
              time: 1_700_000_000,
              messaging: [event],
            },
          ],
        },
      },
    })
  })

  test("warns and falls back to the legacy job after a rejected push", async () => {
    collector.push.mockResolvedValueOnce({
      accepted: false,
      reason: "maxItems",
    })
    const body = buildBody([buildEvent()])

    await webhookHandler(makeProps(body, queue, collector))

    expect(collector.schedule).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      { entryId: PAGE_ID, reason: "maxItems" },
      "Messenger echo collector rejected the event; using the single-event path",
    )
    expect(logger.error).not.toHaveBeenCalled()
    expect(queue.add).toHaveBeenCalledExactlyOnceWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
    )
  })

  test("logs an error and falls back to the legacy job after a thrown push", async () => {
    const error = new Error("push failed")
    collector.push.mockRejectedValueOnce(error)
    const body = buildBody([buildEvent()])

    await webhookHandler(makeProps(body, queue, collector))

    expect(collector.schedule).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: error, entryId: PAGE_ID },
      "Messenger echo collector failed; using the single-event path",
    )
    expect(queue.add).toHaveBeenCalledExactlyOnceWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
    )
  })

  test("leaves an accepted push for sweeper recovery when scheduling fails", async () => {
    const error = new Error("schedule failed")
    collector.schedule.mockRejectedValueOnce(error)
    const body = buildBody([buildEvent()])

    await webhookHandler(makeProps(body, queue, collector))

    expect(collector.push).toHaveBeenCalledOnce()
    expect(collector.schedule).toHaveBeenCalledOnce()
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      { err: error, entryId: PAGE_ID },
      "Messenger echo collector scheduling failed; awaiting sweeper recovery",
    )
    expect(queue.add).not.toHaveBeenCalled()
  })

  test.each([
    [
      "own-send metadata",
      buildEvent({
        message: {
          mid: "mid-1",
          is_echo: true,
          metadata: MESSENGER_MESSAGE_METADATA,
        },
      }),
      null,
    ],
    [
      "quick reply",
      buildEvent({
        message: {
          mid: "mid-1",
          is_echo: true,
          quick_reply: { payload: "choice" },
        },
      }),
      "incomingMessage",
    ],
    [
      "top-level referral",
      buildEvent({
        referral: { source: "ADS", type: "OPEN_THREAD" },
      }),
      "incomingMessage",
    ],
    [
      "message referral",
      buildEvent({
        message: {
          mid: "mid-1",
          is_echo: true,
          referral: { source: "ADS", type: "OPEN_THREAD" },
        },
      }),
      "incomingMessage",
    ],
    [
      "postback referral",
      buildEvent({
        postback: {
          mid: "postback-1",
          title: "Start",
          payload: "START",
          referral: { source: "ADS", type: "OPEN_THREAD" },
        },
      }),
      "incomingMessage",
    ],
    [
      "postback",
      buildEvent({
        message: undefined,
        postback: { mid: "postback-1", title: "Start", payload: "START" },
      }),
      "incomingMessage",
    ],
    [
      "reply",
      buildEvent({
        message: {
          mid: "mid-1",
          is_echo: true,
          reply_to: { mid: "mid-original" },
        },
      }),
      "incomingMessage",
    ],
    [
      "unmodelled reply",
      buildEvent({
        message: {
          mid: "mid-1",
          is_echo: true,
          reply_to: { future_reply_kind: { id: "future-1" } },
        },
      }),
      "incomingMessage",
    ],
    [
      "deleted message",
      buildEvent({
        message: { mid: "mid-1", is_echo: true, is_deleted: true },
      }),
      "deleteIncomingMessage",
    ],
    [
      "reaction",
      buildEvent({
        message: undefined,
        reaction: { mid: "mid-1", action: "react", emoji: "like" },
      }),
      "messageReaction",
    ],
    [
      "read receipt",
      buildEvent({ message: undefined, read: { watermark: 1 } }),
      "contactMarkAsRead",
    ],
    [
      "delivery receipt",
      buildEvent({
        message: undefined,
        delivery: { mids: ["mid-1"], watermark: 1 },
      }),
      null,
    ],
    [
      "non-page sender",
      buildEvent({ sender: { id: "another-page" } }),
      "incomingMessage",
    ],
    [
      "disallowed attachment",
      buildEvent({
        message: {
          mid: "mid-1",
          is_echo: true,
          attachments: [
            {
              type: "location",
              payload: { coordinates: { latitude: 1, longitude: 2 } },
            },
          ],
        },
      }),
      "incomingMessage",
    ],
  ])("keeps the current path for a non-plain echo with %s", async (_name, event, expectedJob) => {
    const body = buildBody([event])

    await webhookHandler(makeProps(body, queue, collector))

    expect(collector.push).not.toHaveBeenCalled()
    expect(collector.schedule).not.toHaveBeenCalled()
    if (expectedJob) {
      expect(queue.add).toHaveBeenCalledOnce()
      expect(queue.add).toHaveBeenCalledWith(
        expectedJob,
        expect.objectContaining({ type: expectedJob }),
      )
    } else {
      expect(queue.add).not.toHaveBeenCalled()
    }
  })

  test("preserves the ordering of non-echo event jobs around a collected echo", async () => {
    const body = buildBody([
      buildEvent({ message: undefined, read: { watermark: 1 } }),
      buildEvent({
        message: undefined,
        reaction: { mid: "mid-1", action: "react", emoji: "like" },
      }),
      buildEvent({
        message: { mid: "mid-deleted", is_deleted: true },
      }),
      buildEvent(),
      buildEvent({
        message: undefined,
        postback: { mid: "postback-1", title: "Start", payload: "START" },
      }),
    ])

    await webhookHandler(makeProps(body, queue, collector))

    expect(queue.add.mock.calls.map(([name]) => name)).toEqual([
      "contactMarkAsRead",
      "messageReaction",
      "deleteIncomingMessage",
      "incomingMessage",
    ])
  })
})
