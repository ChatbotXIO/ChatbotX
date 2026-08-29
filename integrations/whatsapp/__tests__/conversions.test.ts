import { afterEach, describe, expect, test, vi } from "vitest"

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock },
  }
})

const { sendConversionEvent, ensureDataset } = await import(
  "../src/api/conversions"
)

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

  test("ensureDataset names the WABA dataset via dataset_name", async () => {
    postMock.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue({ id: "dataset-1" }),
    })

    await expect(
      ensureDataset({
        wabaId: "waba-1",
        accessToken: "token-1",
        datasetName: "Shop Trần Event Data",
        version: "v23.0",
      }),
    ).resolves.toBe("dataset-1")

    expect(postMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v23.0/waba-1/dataset",
      {
        headers: { Authorization: "Bearer token-1" },
        json: { dataset_name: "Shop Trần Event Data" },
      },
    )
  })

  test("ensureDataset omits dataset_name when no name is given", async () => {
    postMock.mockReturnValueOnce({
      json: vi.fn().mockResolvedValue({ id: "dataset-1" }),
    })

    await ensureDataset({
      wabaId: "waba-1",
      accessToken: "token-1",
      version: "v23.0",
    })

    expect(postMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v23.0/waba-1/dataset",
      {
        headers: { Authorization: "Bearer token-1" },
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

  test("merges hashed customer-info into user_data after the wa identity keys", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventType: "lead",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        sourceEventId: "source-event-3",
        ctwaClid: "clid-3",
        wabaId: "waba-1",
        userData: { em: ["hash-em"], external_id: ["hash-ext"] },
      },
    })

    const [, options] = postMock.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      user_data: {
        whatsapp_business_account_id: "waba-1",
        ctwa_clid: "clid-3",
        em: ["hash-em"],
        external_id: ["hash-ext"],
      },
    })
  })

  test("emits the fixed top-level Limited Data Use triple when limitedDataUse is true", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventType: "lead",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        sourceEventId: "source-event-4",
        ctwaClid: "clid-4",
        wabaId: "waba-1",
        limitedDataUse: true,
      },
    })

    const [, options] = postMock.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      data_processing_options: ["LDU"],
      data_processing_options_country: 0,
      data_processing_options_state: 0,
    })
  })

  test("renders Purchase order_id and contents with num_items summed by quantity", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventType: "purchase",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        sourceEventId: "source-event-5",
        ctwaClid: "clid-5",
        wabaId: "waba-1",
        currency: "USD",
        value: "35",
        orderId: "order-123",
        contents: [
          { id: "sku-1", quantity: 2, itemPrice: 10 },
          { id: "sku-2", quantity: 1, itemPrice: 15 },
        ],
      },
    })

    const [, options] = postMock.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      custom_data: {
        currency: "USD",
        value: 35,
        order_id: "order-123",
        content_type: "product",
        num_items: 3,
        contents: [
          { id: "sku-1", quantity: 2, item_price: 10 },
          { id: "sku-2", quantity: 1, item_price: 15 },
        ],
      },
    })
  })
})
