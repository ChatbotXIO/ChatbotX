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

const { extractCallEventPayloads } = await import("../src/lib/calls")
const { webhookHandler } = await import("../src/handlers/webhook")

const callsValue = (overrides: Record<string, unknown> = {}) => ({
  messaging_product: "whatsapp",
  metadata: {
    display_phone_number: "16505551111",
    phone_number_id: "phone-1",
  },
  contacts: [
    {
      profile: { name: "Kerry Fisher" },
      wa_id: "16315551234",
    },
  ],
  ...overrides,
})

const wrapEntry = (value: unknown) => ({
  object: "whatsapp_business_account",
  entry: [{ id: "waba-1", changes: [{ field: "calls", value }] }],
})

describe("extractCallEventPayloads", () => {
  test("normalizes a user-initiated connect event", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.ABC-123",
              from: "16315551234",
              to: "16505551111",
              event: "connect",
              timestamp: "1755700000",
              direction: "USER_INITIATED",
              session: { sdp_type: "offer", sdp: "v=0..." },
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        contact: {
          waId: "16315551234",
          userId: undefined,
          name: "Kerry Fisher",
        },
        event: {
          kind: "connect",
          wacid: "wacid.ABC-123",
          direction: "userInitiated",
          from: "16315551234",
          to: "16505551111",
          timestamp: "1755700000",
        },
      },
    ])
  })

  test("normalizes a completed terminate event with duration", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          calls: [
            {
              id: "wacid.ABC-123",
              from: "16315551234",
              to: "16505551111",
              event: "terminate",
              direction: "USER_INITIATED",
              timestamp: "1755700100",
              status: "COMPLETED",
              start_time: "1755700010",
              end_time: "1755700100",
              duration: 90,
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        contact: {
          waId: "16315551234",
          userId: undefined,
          name: "Kerry Fisher",
        },
        event: {
          kind: "terminate",
          wacid: "wacid.ABC-123",
          direction: "userInitiated",
          status: "COMPLETED",
          from: "16315551234",
          to: "16505551111",
          timestamp: "1755700100",
          startTime: "1755700010",
          endTime: "1755700100",
          durationSeconds: 90,
        },
      },
    ])
  })

  test("normalizes interim statuses and skips unknown ones", () => {
    const result = extractCallEventPayloads(
      wrapEntry(
        callsValue({
          contacts: undefined,
          statuses: [
            {
              id: "wacid.ABC-123",
              type: "call",
              status: "RINGING",
              timestamp: "1755700001",
              recipient_id: "16315551234",
            },
            {
              id: "wacid.ABC-123",
              type: "call",
              status: "SOMETHING_NEW",
              timestamp: "1755700002",
            },
          ],
        }),
      ),
    )

    expect(result).toEqual([
      {
        phoneNumberId: "phone-1",
        contact: undefined,
        event: {
          kind: "status",
          wacid: "wacid.ABC-123",
          status: "RINGING",
          recipientId: "16315551234",
          timestamp: "1755700001",
        },
      },
    ])
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { wacid: "wacid.ABC-123", status: "SOMETHING_NEW" },
      "Whatsapp call status skipped: unknown status",
    )
  })

  test("ignores non-calls fields and malformed values without throwing", () => {
    expect(
      extractCallEventPayloads({
        object: "whatsapp_business_account",
        entry: [
          {
            id: "waba-1",
            changes: [
              {
                field: "messages",
                value: { metadata: { phone_number_id: "phone-1" } },
              },
              { field: "calls", value: "garbage" },
              { field: "calls", value: { metadata: {} } },
            ],
          },
        ],
      }),
    ).toEqual([])
  })
})

describe("webhookHandler call events", () => {
  test("enqueues one deduplicated BullMQ job per call event", async () => {
    const queueAdd = vi.fn()
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.ABC:123",
            from: "16315551234",
            to: "16505551111",
            event: "connect",
            timestamp: "1755700000",
            direction: "USER_INITIATED",
          },
        ],
        statuses: [
          {
            id: "wacid.ABC:123",
            type: "call",
            status: "RINGING",
            timestamp: "1755700001",
          },
        ],
      }),
    )

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
      "whatsappCallEvent",
      expect.objectContaining({
        type: "whatsappCallEvent",
        data: expect.objectContaining({
          integrationType: "whatsapp",
          integrationIdentifier: "phone-1",
          payload: expect.objectContaining({
            event: expect.objectContaining({
              kind: "connect",
              wacid: "wacid.ABC:123",
            }),
          }),
        }),
      }),
      // BullMQ forbids ":" in custom job ids — the wacid must be sanitized.
      { jobId: "wa-call-wacid.ABC_123-connect" },
    )
    expect(queueAdd).toHaveBeenNthCalledWith(
      2,
      "whatsappCallEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            event: expect.objectContaining({
              kind: "status",
              status: "RINGING",
            }),
          }),
        }),
      }),
      { jobId: "wa-call-wacid.ABC_123-status-RINGING" },
    )

    for (const call of queueAdd.mock.calls) {
      expect(call[2].jobId).not.toContain(":")
    }
  })

  test("keeps acknowledging when one enqueue fails", async () => {
    const queueAdd = vi
      .fn()
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce(undefined)
    const payload = wrapEntry(
      callsValue({
        calls: [
          {
            id: "wacid.A",
            event: "connect",
            direction: "USER_INITIATED",
            from: "16315551234",
          },
          {
            id: "wacid.B",
            event: "terminate",
            direction: "USER_INITIATED",
            status: "FAILED",
            from: "16315551234",
          },
        ],
      }),
    )

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
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ wacid: "wacid.A" }),
      "Whatsapp call event enqueue failed; webhook will still acknowledge",
    )
  })
})
