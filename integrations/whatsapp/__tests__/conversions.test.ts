import { afterEach, describe, expect, test, vi } from "vitest"

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock },
  }
})

const { sendConversionEvent } = await import("../src/api/conversions")

const okResponse = () => ({
  json: vi.fn().mockResolvedValue({ events_received: 1 }),
})

describe("Conversions API", () => {
  afterEach(() => {
    postMock.mockReset()
  })

  test("sendConversionEvent builds the WhatsApp business messaging payload", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      version: "v23.0",
      event: {
        eventType: "purchase",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        sourceEventId: "source-event-1",
        ctwaClid: "clid-1",
        wabaId: "waba-1",
        currency: "USD",
        value: "42.50",
        messagingOutcomeType: "automatic_events",
      },
    })

    expect(postMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v23.0/dataset-1/events",
      {
        headers: {
          Authorization: "Bearer token-1",
        },
        json: {
          data: [
            {
              event_name: "Purchase",
              event_time: 1_786_357_230,
              event_id: "source-event-1",
              action_source: "business_messaging",
              messaging_channel: "whatsapp",
              messaging_outcome_data: { outcome_type: "automatic_events" },
              user_data: {
                whatsapp_business_account_id: "waba-1",
                ctwa_clid: "clid-1",
              },
              custom_data: {
                currency: "USD",
                value: 42.5,
              },
            },
          ],
          partner_agent: "ChatbotX",
        },
      },
    )
  })

  test("maps lead events without purchase custom_data", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventType: "lead",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        sourceEventId: "source-event-2",
        ctwaClid: "clid-2",
        wabaId: "waba-1",
      },
    })

    const [, options] = postMock.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      event_name: "LeadSubmitted",
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        whatsapp_business_account_id: "waba-1",
        ctwa_clid: "clid-2",
      },
    })
    expect(payload?.data?.[0]).not.toHaveProperty("custom_data")
    // Rule-detected lead: no automatic-events outcome should be claimed.
    expect(payload?.data?.[0]).not.toHaveProperty("messaging_outcome_data")
  })
})
