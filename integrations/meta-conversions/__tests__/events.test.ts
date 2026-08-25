import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
}))

vi.mock("../src/lib/http-client", () => ({
  metaConversionsGraphClient: {
    post: (...args: unknown[]) => mocks.post(...args),
  },
  graphAuthHeaders: (accessToken: string) => ({
    Authorization: `Bearer ${accessToken}`,
  }),
}))

const { sendConversionEvent } = await import("../src/apis/events")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("Meta Conversions events API", () => {
  test("builds the Messenger business messaging payload", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      version: "v24.0",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-1",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
        currency: "USD",
        value: "42.50",
        contentCategory: "Education",
        contentName: "Landing Page A",
      },
    })

    expect(mocks.post).toHaveBeenCalledWith("v24.0/dataset-1/events", {
      headers: { Authorization: "Bearer token-1" },
      json: {
        data: [
          {
            event_name: "LeadSubmitted",
            event_time: 1_786_357_230,
            event_id: "event-1",
            action_source: "business_messaging",
            messaging_channel: "messenger",
            user_data: {
              page_id: "page-1",
              page_scoped_user_id: "psid-1",
            },
            custom_data: {
              currency: "USD",
              value: 42.5,
              content_category: "Education",
              content_name: "Landing Page A",
            },
          },
        ],
        partner_agent: "ChatConnectX",
      },
    })
  })

  test("builds the Instagram business messaging payload", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-2",
        messagingChannel: "instagram",
        instagramBusinessAccountId: "ig-business-1",
        igSid: "ig-sid-1",
      },
    })

    const [, options] = mocks.post.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      event_name: "LeadSubmitted",
      action_source: "business_messaging",
      messaging_channel: "instagram",
      user_data: {
        ig_account_id: "ig-business-1",
        instagram_business_account_id: "ig-business-1",
        ig_sid: "ig-sid-1",
      },
    })
    expect(payload?.data?.[0]).not.toHaveProperty("custom_data")
  })

  test("builds the WhatsApp business messaging payload", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      version: "v24.0",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-4",
        messagingChannel: "whatsapp",
        wabaId: "waba-1",
        ctwaClid: "clid-1",
        currency: "USD",
        value: "42.50",
      },
    })

    expect(mocks.post).toHaveBeenCalledWith("v24.0/dataset-1/events", {
      headers: { Authorization: "Bearer token-1" },
      json: {
        data: [
          {
            event_name: "LeadSubmitted",
            event_time: 1_786_357_230,
            event_id: "event-4",
            action_source: "business_messaging",
            messaging_channel: "whatsapp",
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
        partner_agent: "ChatConnectX",
      },
    })
  })

  test("includes content fields in the Instagram custom_data", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-3",
        messagingChannel: "instagram",
        instagramBusinessAccountId: "ig-business-1",
        igSid: "ig-sid-1",
        contentCategory: "Education",
        contentName: "Landing Page A",
      },
    })

    const [, options] = mocks.post.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      custom_data: {
        content_category: "Education",
        content_name: "Landing Page A",
      },
    })
  })

  test("merges hashed customer-info into user_data after the channel identity keys", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      version: "v24.0",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-5",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
        userData: {
          em: ["hash-em"],
          ph: ["hash-ph"],
          external_id: ["hash-ext"],
        },
      },
    })

    const [, options] = mocks.post.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      user_data: {
        page_id: "page-1",
        page_scoped_user_id: "psid-1",
        em: ["hash-em"],
        ph: ["hash-ph"],
        external_id: ["hash-ext"],
      },
    })
  })

  test("emits the fixed top-level Limited Data Use triple when limitedDataUse is true", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-6",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
        limitedDataUse: true,
      },
    })

    const [, options] = mocks.post.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      data_processing_options: ["LDU"],
      data_processing_options_country: 0,
      data_processing_options_state: 0,
    })
  })

  test("omits data_processing_options entirely when limitedDataUse is false/absent", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "LeadSubmitted",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-7",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
      },
    })

    const [, options] = mocks.post.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).not.toHaveProperty("data_processing_options")
  })

  test("renders Purchase order_id and contents with num_items summed by quantity", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "Purchase",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-8",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
        currency: "USD",
        value: "35",
        orderId: "order-123",
        contents: [
          { id: "sku-1", quantity: 2, itemPrice: 10 },
          { id: "sku-2", quantity: 1, itemPrice: 15 },
        ],
      },
    })

    const [, options] = mocks.post.mock.calls[0]
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
