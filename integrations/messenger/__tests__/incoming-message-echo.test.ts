import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  MESSENGER_ECHO_MAX_ATTACHMENTS,
  parseEcho,
  receiveMessage,
} from "../src/handlers/message/incomming-message"

const ctx = {
  auth: { metadata: { pageId: "page-1" } },
} as never

const now = new Date("2026-09-25T00:00:00.000Z")
const channelCreatedAt = new Date("2026-09-24T23:59:00.000Z")

const buildEvent = (
  message: Record<string, unknown>,
  timestamp = channelCreatedAt.getTime(),
) => ({
  sender: { id: "page-1" },
  recipient: { id: "psid-1" },
  timestamp,
  message,
})

const buildWebhook = (messaging: ReturnType<typeof buildEvent>) => ({
  object: "page",
  entry: [{ id: "page-1", time: messaging.timestamp, messaging: [messaging] }],
})

describe("Messenger parseEcho", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("parses a text echo without performing attachment work", async () => {
    const result = await parseEcho({
      ctx,
      data: {
        payload: buildEvent({ mid: "mid-1", text: "hello", is_echo: true }),
      },
    })

    expect(result).toEqual({
      sourceId: "mid-1",
      contactSourceId: "psid-1",
      createdAt: channelCreatedAt,
      text: "hello",
      contentType: "text",
      contentAttributes: undefined,
      attachments: [],
    })
  })

  test("routes an out-of-window echo away from the batch parser", async () => {
    const staleEvent = buildEvent(
      { mid: "mid-stale", text: "old", is_echo: true },
      now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1,
    )

    await expect(
      parseEcho({ ctx, data: { payload: staleEvent } }),
    ).resolves.toBeNull()

    const result = await receiveMessage({
      ctx,
      data: { payload: buildWebhook(staleEvent) },
    })
    expect(result.message?.createdAt).toBeUndefined()
  })

  test("never stamps inbound messages with the channel timestamp", async () => {
    const inboundEvent = {
      ...buildEvent({ mid: "mid-inbound", text: "hello" }),
      sender: { id: "psid-1" },
      recipient: { id: "page-1" },
    }

    const result = await receiveMessage({
      ctx,
      data: { payload: buildWebhook(inboundEvent) },
    })

    expect(result.message?.createdAt).toBeUndefined()
  })

  test("assigns stable ids after deduping repeated attachment urls", async () => {
    const payload = buildEvent({
      mid: "mid-images",
      is_echo: true,
      attachments: [
        { type: "image", payload: { url: "https://cdn.test/one.png" } },
        { type: "image", payload: { url: "https://cdn.test/one.png" } },
        { type: "file", payload: { url: "https://cdn.test/two.pdf" } },
      ],
    })

    const first = await parseEcho({ ctx, data: { payload } })
    const second = await parseEcho({ ctx, data: { payload } })

    expect(first?.attachments).toEqual([
      {
        sourceId: "mid-images:0",
        type: "image",
        url: "https://cdn.test/one.png",
      },
      {
        sourceId: "mid-images:1",
        type: "file",
        url: "https://cdn.test/two.pdf",
      },
    ])
    expect(second?.attachments).toEqual(first?.attachments)
  })

  test("caps unique echo attachments after deduplication", async () => {
    const attachments = Array.from(
      { length: MESSENGER_ECHO_MAX_ATTACHMENTS + 2 },
      (_, index) => ({
        type: "image",
        payload: { url: `https://cdn.test/${index}.png` },
      }),
    )
    attachments.splice(1, 0, attachments[0] as (typeof attachments)[number])

    const result = await parseEcho({
      ctx,
      data: {
        payload: buildEvent({
          mid: "mid-many-images",
          is_echo: true,
          attachments,
        }),
      },
    })

    expect(result?.attachments).toHaveLength(MESSENGER_ECHO_MAX_ATTACHMENTS)
    expect(result?.attachments.at(-1)?.url).toBe(
      `https://cdn.test/${MESSENGER_ECHO_MAX_ATTACHMENTS - 1}.png`,
    )
  })

  test("does not create descriptors for template attachments", async () => {
    const result = await parseEcho({
      ctx,
      data: {
        payload: buildEvent({
          mid: "mid-template",
          is_echo: true,
          attachments: [{ type: "template", payload: {} }],
        }),
      },
    })

    expect(result?.attachments).toEqual([])
  })

  test("parses an unexpected location echo without crashing", async () => {
    const result = await parseEcho({
      ctx,
      data: {
        payload: buildEvent({
          mid: "mid-location",
          is_echo: true,
          attachments: [
            {
              type: "location",
              payload: { coordinates: { latitude: 10.5, longitude: 20.5 } },
            },
          ],
        }),
      },
    })

    expect(result).toEqual(
      expect.objectContaining({
        contentType: "location",
        contentAttributes: { latitude: "10.5", longitude: "20.5" },
        attachments: [],
      }),
    )
  })

  test("returns null for a valid non-message event", async () => {
    await expect(
      parseEcho({
        ctx,
        data: {
          payload: {
            sender: { id: "page-1" },
            recipient: { id: "psid-1" },
            timestamp: 1,
            read: { watermark: 1 },
          },
        },
      }),
    ).resolves.toBeNull()
  })

  test("throws for an invalid event", async () => {
    await expect(
      parseEcho({ ctx, data: { payload: { timestamp: 1 } } }),
    ).rejects.toThrow()
  })
})
