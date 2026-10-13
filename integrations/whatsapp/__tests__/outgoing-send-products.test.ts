import {
  ChannelErrorCategory,
  type ProductMessageItem,
  type ResolvedProductMessage,
} from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockApiFetch, mockSendMessage, mockGetWhatsappClient } = vi.hoisted(
  () => {
    const apiFetch = vi.fn()
    const sendMessageFn = vi.fn()
    return {
      mockApiFetch: apiFetch,
      mockSendMessage: sendMessageFn,
      mockGetWhatsappClient: vi.fn(() => ({
        $$apiFetch$$: apiFetch,
        sendMessage: sendMessageFn,
      })),
    }
  },
)

vi.mock("../src/client", () => ({ getWhatsappClient: mockGetWhatsappClient }))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep, handledFlowStepTypes } = await import(
  "../src/handlers/message/outgoing-message"
)
const { convertFlowStepSendProducts } = await import(
  "../src/handlers/message/outgoing-message/send-products"
)

const item = (productId: string): ProductMessageItem => ({
  productId,
  name: `Product ${productId}`,
  imageUrl: null,
  price: 10,
  currency: "USD",
  catalogReference: {
    source: "metaCatalog",
    catalogId: "cat-1",
    retailerId: `sku-${productId}`,
  },
})

const PHONE_NUMBER_ID = "pn-1"
const ctx = {
  auth: { metadata: { phoneNumber: { id: PHONE_NUMBER_ID } } },
} as never
const phoneContact = { id: "c-1", sourceId: "84123456789" } as never
const bsuidContact = {
  id: "c-2",
  sourceId: "user.9373001",
  sourceUserId: "user.9373001",
} as never

const stepProps = (
  productMessage: ResolvedProductMessage | undefined,
  contact: unknown = phoneContact,
) =>
  ({
    ctx,
    data: {
      contact,
      flowId: "1",
      step: { id: "step-1", stepType: "sendProducts" },
      productMessage,
    },
  }) as never

const convert = (productMessage: ResolvedProductMessage) => [
  ...convertFlowStepSendProducts(stepProps(productMessage)),
]

describe("convertFlowStepSendProducts", () => {
  test("one product becomes a single-product message with optional body and footer", () => {
    expect(
      convert({
        display: "products",
        body: "Have a look",
        footer: "Free delivery",
        sections: [{ items: [item("1")] }],
      }),
    ).toEqual([
      {
        _type: "interactive_product",
        type: "interactive",
        interactive: {
          type: "product",
          body: { text: "Have a look" },
          footer: { text: "Free delivery" },
          action: { catalog_id: "cat-1", product_retailer_id: "sku-1" },
        },
      },
    ])
  })

  test("a single product with no text carries neither body nor footer", () => {
    const [message] = convert({
      display: "products",
      sections: [{ items: [item("1")] }],
    })

    expect(message?.interactive).toEqual({
      type: "product",
      action: { catalog_id: "cat-1", product_retailer_id: "sku-1" },
    })
  })

  test("several products become a multi-product message, sections and order kept", () => {
    expect(
      convert({
        display: "products",
        header: "Our picks",
        body: "Have a look",
        sections: [
          { title: "Shoes", items: [item("2"), item("1")] },
          { title: "Bags", items: [item("3")] },
        ],
      }),
    ).toEqual([
      {
        _type: "interactive_product_list",
        type: "interactive",
        interactive: {
          type: "product_list",
          header: { type: "text", text: "Our picks" },
          body: { text: "Have a look" },
          action: {
            catalog_id: "cat-1",
            sections: [
              {
                title: "Shoes",
                product_items: [
                  { product_retailer_id: "sku-2" },
                  { product_retailer_id: "sku-1" },
                ],
              },
              {
                title: "Bags",
                product_items: [{ product_retailer_id: "sku-3" }],
              },
            ],
          },
        },
      },
    ])
  })

  test("a single untitled section has no title key", () => {
    const [message] = convert({
      display: "products",
      header: "Our picks",
      body: "Have a look",
      sections: [{ items: [item("1"), item("2")] }],
    })

    expect(message?.interactive).toMatchObject({
      action: { sections: [{ product_items: expect.any(Array) }] },
    })
    expect(
      (message?.interactive as { action: { sections: object[] } }).action
        .sections[0],
    ).not.toHaveProperty("title")
  })

  test("a multi-product message without header or body is refused, not repaired", () => {
    expect(() =>
      convert({
        display: "products",
        body: "Have a look",
        sections: [{ items: [item("1"), item("2")] }],
      }),
    ).toThrow("header and a body")
  })

  test("carousel becomes product cards indexed from 0, body only", () => {
    expect(
      convert({
        display: "carousel",
        body: "Look",
        items: [item("1"), item("2"), item("3")],
      }),
    ).toEqual([
      {
        _type: "interactive_product_carousel",
        type: "interactive",
        interactive: {
          type: "carousel",
          body: { text: "Look" },
          action: {
            cards: [
              {
                card_index: 0,
                type: "product",
                action: { product_retailer_id: "sku-1", catalog_id: "cat-1" },
              },
              {
                card_index: 1,
                type: "product",
                action: { product_retailer_id: "sku-2", catalog_id: "cat-1" },
              },
              {
                card_index: 2,
                type: "product",
                action: { product_retailer_id: "sku-3", catalog_id: "cat-1" },
              },
            ],
          },
        },
      },
    ])
  })

  test("catalog message has no catalog_id, and parameters only with a thumbnail", () => {
    const [withoutThumbnail] = convert({
      display: "catalog",
      body: "Browse",
      footer: "Deals",
    })
    expect(withoutThumbnail).toEqual({
      _type: "interactive_catalog",
      type: "interactive",
      interactive: {
        type: "catalog_message",
        body: { text: "Browse" },
        footer: { text: "Deals" },
        action: { name: "catalog_message" },
      },
    })

    const [withThumbnail] = convert({
      display: "catalog",
      body: "Browse",
      thumbnail: item("7"),
    })
    expect(withThumbnail?.interactive).toEqual({
      type: "catalog_message",
      body: { text: "Browse" },
      action: {
        name: "catalog_message",
        parameters: { thumbnail_product_retailer_id: "sku-7" },
      },
    })
    expect(JSON.stringify(withThumbnail)).not.toContain("catalog_id")
  })

  test("does not truncate text — limits are enforced before this point", () => {
    const body = "b".repeat(1024)
    const [message] = convert({
      display: "carousel",
      body,
      items: [item("1"), item("2")],
    })

    expect((message?.interactive as { body: { text: string } }).body.text).toBe(
      body,
    )
  })

  test("fails loudly when the step arrives without resolved products", () => {
    expect(() => [
      ...convertFlowStepSendProducts(stepProps(undefined)),
    ]).toThrow("without resolved products")
  })
})

describe("sendFlowStep — sendProducts delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.products-1" }] }), {
        status: 200,
      }),
    )
  })

  const catalogMessage: ResolvedProductMessage = {
    display: "catalog",
    body: "Browse",
  }
  const requestBody = () =>
    JSON.parse((mockApiFetch.mock.calls[0]?.[1] as RequestInit).body as string)

  test("is declared as handled, so the channel policy contract holds", () => {
    expect(handledFlowStepTypes).toContain("sendProducts")
  })

  test("posts the interactive payload raw to a phone-keyed contact", async () => {
    const result = await sendFlowStep(stepProps(catalogMessage))

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    const body = requestBody()
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "84123456789",
      type: "interactive",
      interactive: { type: "catalog_message", body: { text: "Browse" } },
    })
    expect(body).not.toHaveProperty("_type")
    expect(result).toEqual({ messageIds: ["wamid.products-1"], sentCount: 1 })
  })

  test("addresses a BSUID-keyed contact with `recipient`, not `to`", async () => {
    await sendFlowStep(stepProps(catalogMessage, bsuidContact))

    const body = requestBody()
    expect(body.recipient).toBe("user.9373001")
    expect(body).not.toHaveProperty("to")
  })

  test.each([
    [
      "single product",
      { display: "products", sections: [{ items: [item("1")] }] },
      "product",
    ],
    [
      "multi-product",
      {
        display: "products",
        header: "h",
        body: "b",
        sections: [{ items: [item("1"), item("2")] }],
      },
      "product_list",
    ],
    [
      "carousel",
      { display: "carousel", body: "b", items: [item("1"), item("2")] },
      "carousel",
    ],
  ] as const)("sends %s with interactive.type %s over the raw path", async (_name, message, interactiveType) => {
    await sendFlowStep(stepProps(message as ResolvedProductMessage))

    expect(requestBody().interactive.type).toBe(interactiveType)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  const metaRejection = (code: number, type?: string) =>
    mockApiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: `(#${code}) Meta rejected the message`,
            ...(type ? { type } : {}),
            code,
            error_data: { messaging_product: "whatsapp", details: "details" },
          },
        }),
        { status: 400 },
      ),
    )

  // `mapToChannelError` is shared with every other WhatsApp send; these pin how
  // the rejections a product message can hit are classified today, so a change
  // to that mapping is a visible decision rather than a silent one.
  test.each([
    [
      "an invalid parameter (unknown product, catalog not linked)",
      131_009,
      undefined,
      ChannelErrorCategory.PAYLOAD_INVALID,
      false,
    ],
    [
      "the throughput limit",
      130_429,
      undefined,
      ChannelErrorCategory.RATE_LIMITED,
      true,
    ],
    [
      "the 24h customer-care window",
      131_047,
      undefined,
      ChannelErrorCategory.QUOTA_EXCEEDED,
      false,
    ],
    // Meta sends most of these as an OAuthException, which the mapper reads as
    // a credential problem ahead of the code — unchanged here, shared with
    // template sends.
    [
      "an invalid parameter reported as an OAuthException",
      131_009,
      "OAuthException",
      ChannelErrorCategory.AUTH_FAILED,
      false,
    ],
  ])("Meta rejecting a product message for %s is a %#", async (_name, code, type, category, retryable) => {
    metaRejection(code, type)

    await expect(sendFlowStep(stepProps(catalogMessage))).rejects.toMatchObject(
      {
        category,
        code,
        isRetryable: retryable,
      },
    )
  })
})
