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

  test("sends test_event_code at the request top level only when provided", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })
    const event = {
      eventName: "Purchase",
      occurredAt: new Date("2026-08-10T10:20:30.000Z"),
      eventId: "event-test",
      messagingChannel: "messenger" as const,
      pageId: "page-1",
      pageScopedUserId: "psid-1",
      value: "250",
      currency: "VND",
    }

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event,
      testEventCode: "TEST33520",
    })
    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event,
    })

    const [withCode, withoutCode] = mocks.post.mock.calls.map(
      (call) => (call[1] as { json: Record<string, unknown> }).json,
    )
    expect(withCode.test_event_code).toBe("TEST33520")
    expect(withoutCode).not.toHaveProperty("test_event_code")
    // The event payload itself is unaffected by the test code.
    expect(withCode.data).toEqual(withoutCode.data)
  })

  test("explicit actionSource business_messaging is identical to omitting it", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      version: "v24.0",
      event: {
        actionSource: "business_messaging",
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

  test("builds a non-messaging email event with no messaging identity", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      version: "v24.0",
      event: {
        actionSource: "email",
        eventName: "Lead",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-9",
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
      event_name: "Lead",
      action_source: "email",
      user_data: {
        em: ["hash-em"],
        ph: ["hash-ph"],
        external_id: ["hash-ext"],
      },
    })
    expect(payload?.data?.[0]).not.toHaveProperty("messaging_channel")
    expect(payload?.data?.[0]?.user_data).not.toHaveProperty("page_id")
    expect(payload?.data?.[0]?.user_data).not.toHaveProperty("ig_sid")
    expect(payload?.data?.[0]?.user_data).not.toHaveProperty("ctwa_clid")
    // `user_data` on a non-messaging event IS the hashed customer info,
    // exactly (no channel identity keys mixed in) — `userData` is now a
    // required field on the non-messaging identity, so this can never come
    // back empty.
    expect(payload?.data?.[0]?.user_data).toEqual({
      em: ["hash-em"],
      ph: ["hash-ph"],
      external_id: ["hash-ext"],
    })
  })

  test("includes content_type and content_ids when provided, omits them when absent", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "ViewContent",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-10",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
        contentType: "product_group",
        contentIds: ["sku-1", "sku-2"],
      },
    })

    const [, firstOptions] = mocks.post.mock.calls[0]
    const firstPayload = firstOptions?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(firstPayload?.data?.[0]).toMatchObject({
      custom_data: {
        content_type: "product_group",
        content_ids: ["sku-1", "sku-2"],
      },
    })

    mocks.post.mockClear()
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "ViewContent",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-11",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
      },
    })

    const [, secondOptions] = mocks.post.mock.calls[0]
    const secondPayload = secondOptions?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(secondPayload?.data?.[0]).not.toHaveProperty("custom_data")
  })

  test("explicit contentType product_group beats the contents[]-derived product default", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        eventName: "Purchase",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-12",
        messagingChannel: "messenger",
        pageId: "page-1",
        pageScopedUserId: "psid-1",
        contentType: "product_group",
        contents: [{ id: "sku-1", quantity: 1, itemPrice: 10 }],
      },
    })

    const [, options] = mocks.post.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      custom_data: {
        content_type: "product_group",
        num_items: 1,
      },
    })
  })

  test("passes a custom event name through unchanged", async () => {
    mocks.post.mockResolvedValue({ data: { events_received: 1 } })

    await sendConversionEvent({
      datasetId: "dataset-1",
      accessToken: "token-1",
      event: {
        actionSource: "other",
        eventName: "MyCustomEvent",
        occurredAt: new Date("2026-08-10T10:20:30.000Z"),
        eventId: "event-13",
        userData: {
          external_id: ["hash-ext"],
        },
      },
    })

    const [, options] = mocks.post.mock.calls[0]
    const payload = options?.json as
      | { data?: Record<string, unknown>[] }
      | undefined
    expect(payload?.data?.[0]).toMatchObject({
      event_name: "MyCustomEvent",
      action_source: "other",
    })
  })
})
