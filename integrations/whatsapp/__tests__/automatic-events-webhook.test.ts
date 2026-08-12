import { describe, expect, test, vi } from "vitest"

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

type MiddlewareHandlers = {
  message?: (args: unknown) => void
  sent?: () => void
  status?: (args: unknown) => void
}

vi.mock("../src/lib/logger", () => ({
  logger: mockLogger,
}))

vi.mock("whatsapp-api-js/middleware/next", () => ({
  WhatsAppAPI: class {
    on: MiddlewareHandlers = {}

    get = vi.fn()

    handle_post = vi.fn(() => {
      queueMicrotask(() => {
        this.on.sent?.()
      })
      return Promise.resolve(200)
    })
  },
}))

const { extractAutomaticEventPayloads, webhookHandler } = await import(
  "../src/handlers/webhook"
)

const automaticEvent = (overrides: Record<string, unknown> = {}) => ({
  event_name: "LeadSubmitted",
  id: "wamid.lead-1",
  timestamp: "1800000000",
  ctwa_clid: "clid-1",
  custom_data: {
    currency: "USD",
    value: "19.99",
  },
  ...overrides,
})

const automaticValue = (events: unknown[], phoneNumberId = "phone-1") => ({
  messaging_product: "whatsapp",
  metadata: {
    phone_number_id: "phone-1",
  },
  automatic_events: events,
  ...(phoneNumberId === "phone-1"
    ? {}
    : { metadata: { phone_number_id: phoneNumberId } }),
})

describe("extractAutomaticEventPayloads", () => {
  test("finds automatic events in a realistic multi-entry payload", () => {
    const result = extractAutomaticEventPayloads({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "messages",
              value: { metadata: { phone_number_id: "phone-ignored" } },
            },
            {
              field: "automatic_events",
              value: automaticValue([
                automaticEvent(),
                automaticEvent({
                  event_name: "Purchase",
                  id: "wamid.purchase-1",
                  timestamp: 1_800_000_001,
                  ctwa_clid: "clid-2",
                }),
              ]),
            },
          ],
        },
        {
          id: "waba-2",
          changes: [
            {
              field: "automatic_events",
              value: automaticValue(
                [
                  automaticEvent({
                    event_name: "LeadSubmitted",
                    id: "wamid.lead-2",
                    timestamp: "1800000002",
                    ctwa_clid: "clid-3",
                  }),
                ],
                "phone-2",
              ),
            },
          ],
        },
      ],
    })

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        wabaId: "waba-1",
        payload: {
          event_name: "LeadSubmitted",
          id: "wamid.lead-1",
          timestamp: "1800000000",
          ctwa_clid: "clid-1",
          custom_data: { currency: "USD", value: "19.99" },
        },
      },
      {
        phoneNumberId: "phone-1",
        wabaId: "waba-1",
        payload: {
          event_name: "Purchase",
          id: "wamid.purchase-1",
          timestamp: 1_800_000_001,
          ctwa_clid: "clid-2",
          custom_data: { currency: "USD", value: "19.99" },
        },
      },
      {
        phoneNumberId: "phone-2",
        wabaId: "waba-2",
        payload: {
          event_name: "LeadSubmitted",
          id: "wamid.lead-2",
          timestamp: "1800000002",
          ctwa_clid: "clid-3",
          custom_data: { currency: "USD", value: "19.99" },
        },
      },
    ])
  })

  test("skips malformed values without throwing", () => {
    expect(() =>
      extractAutomaticEventPayloads({
        entry: [
          {
            id: "waba-1",
            changes: [
              {
                field: "automatic_events",
                value: automaticValue([
                  automaticEvent({ ctwa_clid: undefined }),
                ]),
              },
              {
                field: "automatic_events",
                value: "garbage",
              },
            ],
          },
        ],
      }),
    ).not.toThrow()

    expect(
      extractAutomaticEventPayloads({
        entry: [
          {
            id: "waba-1",
            changes: [
              {
                field: "automatic_events",
                value: automaticValue([
                  automaticEvent({ ctwa_clid: undefined }),
                ]),
              },
            ],
          },
        ],
      }),
    ).toEqual([])
  })

  test("skips unknown event_name values while preserving valid siblings", () => {
    const result = extractAutomaticEventPayloads({
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "automatic_events",
              value: automaticValue([
                automaticEvent({ event_name: "OtherEvent" }),
                automaticEvent({ id: "wamid.lead-2" }),
              ]),
            },
          ],
        },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.payload.id).toBe("wamid.lead-2")
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { eventName: "OtherEvent" },
      "Whatsapp automatic event skipped: unknown event_name",
    )
  })
})

describe("webhookHandler automatic events", () => {
  test("enqueues one BullMQ job for each automatic event item", async () => {
    const queueAdd = vi.fn()
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "automatic_events",
              value: automaticValue([
                automaticEvent({ id: "wamid.lead-1" }),
                automaticEvent({
                  event_name: "Purchase",
                  id: "wamid.purchase-1",
                }),
              ]),
            },
          ],
        },
      ],
    }

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token" },
        req: new Request("https://example.com/webhook", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(queueAdd).toHaveBeenCalledTimes(2)
    expect(queueAdd).toHaveBeenNthCalledWith(
      1,
      "adsAutomaticEvent",
      expect.objectContaining({
        type: "adsAutomaticEvent",
        data: expect.objectContaining({
          integrationIdentifier: "phone-1",
          phoneNumberId: "phone-1",
          wabaId: "waba-1",
          payload: expect.objectContaining({ id: "wamid.lead-1" }),
        }),
      }),
      { jobId: "ads-auto-phone-1-wamid.lead-1" },
    )
    expect(queueAdd).toHaveBeenNthCalledWith(
      2,
      "adsAutomaticEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({ id: "wamid.purchase-1" }),
        }),
      }),
      { jobId: "ads-auto-phone-1-wamid.purchase-1" },
    )
  })

  // HIGH-6: a failed enqueue used to be caught by a try/catch wrapping the
  // WHOLE loop, silently dropping every event queued after the failure. The
  // fix moves the try/catch inside the loop so only the failing event is
  // lost.
  test("enqueues the 1st and 3rd events when the 2nd enqueue throws", async () => {
    const queueAdd = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce(undefined)
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "automatic_events",
              value: automaticValue([
                automaticEvent({ id: "wamid.lead-1" }),
                automaticEvent({
                  event_name: "Purchase",
                  id: "wamid.purchase-1",
                }),
                automaticEvent({ id: "wamid.lead-2" }),
              ]),
            },
          ],
        },
      ],
    }

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token" },
        req: new Request("https://example.com/webhook", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(queueAdd).toHaveBeenCalledTimes(3)
    expect(queueAdd).toHaveBeenNthCalledWith(
      1,
      "adsAutomaticEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({ id: "wamid.lead-1" }),
        }),
      }),
      { jobId: "ads-auto-phone-1-wamid.lead-1" },
    )
    expect(queueAdd).toHaveBeenNthCalledWith(
      3,
      "adsAutomaticEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({ id: "wamid.lead-2" }),
        }),
      }),
      { jobId: "ads-auto-phone-1-wamid.lead-2" },
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumberId: "phone-1",
        eventId: "wamid.purchase-1",
      }),
      "Whatsapp automatic event enqueue failed; webhook will still acknowledge",
    )
  })
})
