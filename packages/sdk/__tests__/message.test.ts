import { describe, expect, test, vi } from "vitest"
import {
  getCanonicalReplyPayload,
  getInboundOrder,
  getReferredProduct,
  getViewCatalogEntity,
  getWhatsappFlowResponse,
  isDistinctPrimaryIdentity,
  isWhatsappNativeLocationRequest,
  type MessageButtonTemplate,
  NATIVE_LOCATION_REQUEST_CHANNELS,
  resolveMessagingWindowOpenedAt,
  resolveSourceScopedIdentityMatch,
  URL_QUICK_REPLY_CAPABLE_CHANNELS,
  WHATSAPP_NATIVE_LOCATION_REQUEST,
} from "../src"

describe("isDistinctPrimaryIdentity", () => {
  test.each([
    undefined,
    null,
    "",
    "   ",
  ])("rejects an empty primary identity: %o", (value) => {
    expect(isDistinctPrimaryIdentity(value, "bsuid-1")).toBe(false)
  })

  test("compares trimmed primary and scoped identities", () => {
    expect(isDistinctPrimaryIdentity("  bsuid-1  ", "bsuid-1")).toBe(false)
    expect(isDistinctPrimaryIdentity("84900000001", " 84900000001 ")).toBe(
      false,
    )
  })

  test("accepts a non-empty primary identity distinct from every scoped identity", () => {
    expect(
      isDistinctPrimaryIdentity(
        " 84900000001 ",
        undefined,
        null,
        "",
        "bsuid-1",
      ),
    ).toBe(true)
  })
})

describe("resolveSourceScopedIdentityMatch", () => {
  test("probes sourceParentUserId only after sourceId and sourceUserId miss", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "contact-inbox-1" })

    await expect(
      resolveSourceScopedIdentityMatch(
        {
          sourceId: "84900000001",
          sourceUserId: "bsuid-new",
          sourceParentUserId: "parent-bsuid",
        },
        lookup,
      ),
    ).resolves.toEqual({
      row: { id: "contact-inbox-1" },
      matchedBy: "sourceParentUserId",
    })
    expect(lookup.mock.calls).toEqual([
      [{ sourceId: "84900000001" }],
      [{ sourceUserId: "bsuid-new" }],
      [{ sourceParentUserId: "parent-bsuid" }],
    ])
  })

  test("skips the parent probe when sourceParentUserId is absent", async () => {
    const lookup = vi.fn().mockResolvedValue(undefined)

    await expect(
      resolveSourceScopedIdentityMatch(
        { sourceId: "84900000001", sourceUserId: "bsuid-new" },
        lookup,
      ),
    ).resolves.toBeUndefined()
    expect(lookup).toHaveBeenCalledTimes(2)
  })

  test("a sourceUserId hit short-circuits the parent probe", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: "contact-inbox-1" })

    await expect(
      resolveSourceScopedIdentityMatch(
        {
          sourceId: "84900000001",
          sourceUserId: "bsuid-current",
          sourceParentUserId: "parent-bsuid",
        },
        lookup,
      ),
    ).resolves.toEqual({
      row: { id: "contact-inbox-1" },
      matchedBy: "sourceUserId",
    })
    expect(lookup).toHaveBeenCalledTimes(2)
  })
})

describe("getCanonicalReplyPayload", () => {
  test("returns postback for a postback button", () => {
    const button: MessageButtonTemplate = {
      id: "qr-1",
      label: "Yes",
      buttonType: "postback",
      postback: "flow-1::qr-1",
    }

    expect(getCanonicalReplyPayload(button)).toBe("flow-1::qr-1")
  })

  test("returns fallback postback for a URL button when present", () => {
    const button: MessageButtonTemplate = {
      id: "qr-2",
      label: "Open",
      buttonType: "url",
      url: "https://example.com?code=flow-1::qr-2",
      postback: "flow-1::qr-2",
    }

    expect(getCanonicalReplyPayload(button)).toBe("flow-1::qr-2")
  })

  test("returns URL for a URL button without fallback postback", () => {
    const button: MessageButtonTemplate = {
      id: "qr-3",
      label: "Open",
      buttonType: "url",
      url: "https://example.com",
    }

    expect(getCanonicalReplyPayload(button)).toBe("https://example.com")
  })
})

describe("URL_QUICK_REPLY_CAPABLE_CHANNELS", () => {
  test("lists only the channels verified to render a url quick reply as a real link button", () => {
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("messenger")).toBe(true)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("telegram")).toBe(true)
  })

  test("excludes channels that silently degrade a url quick reply", () => {
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("whatsapp")).toBe(false)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("instagram")).toBe(false)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("zalo")).toBe(false)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("tiktok")).toBe(false)
    expect(URL_QUICK_REPLY_CAPABLE_CHANNELS.has("webchat")).toBe(false)
  })
})

describe("NATIVE_LOCATION_REQUEST_CHANNELS", () => {
  test("lists only WhatsApp, which can send Cloud API location_request_message", () => {
    expect(NATIVE_LOCATION_REQUEST_CHANNELS.has("whatsapp")).toBe(true)
  })

  test("excludes channels that cannot render Meta's native Send location button", () => {
    expect(NATIVE_LOCATION_REQUEST_CHANNELS.has("messenger")).toBe(false)
    expect(NATIVE_LOCATION_REQUEST_CHANNELS.has("telegram")).toBe(false)
    expect(NATIVE_LOCATION_REQUEST_CHANNELS.has("webchat")).toBe(false)
  })
})

describe("isWhatsappNativeLocationRequest", () => {
  test("detects the reserved location-request postback", () => {
    const button: MessageButtonTemplate = {
      id: WHATSAPP_NATIVE_LOCATION_REQUEST,
      label: "Send location",
      buttonType: "postback",
      postback: WHATSAPP_NATIVE_LOCATION_REQUEST,
    }

    expect(isWhatsappNativeLocationRequest([button])).toBe(true)
  })

  test("returns false for ordinary postbacks and missing buttons", () => {
    const button: MessageButtonTemplate = {
      id: "qr-1",
      label: "Yes",
      buttonType: "postback",
      postback: "flow-1::qr-1",
    }

    expect(isWhatsappNativeLocationRequest([button])).toBe(false)
    expect(isWhatsappNativeLocationRequest(undefined)).toBe(false)
  })
})

describe("resolveMessagingWindowOpenedAt", () => {
  const createdAt = new Date("2026-09-18T10:00:00Z")

  test("a contact's message opens the window when it arrived", () => {
    expect(
      resolveMessagingWindowOpenedAt({ messageType: "incoming", createdAt }),
    ).toEqual(createdAt)
  })

  test("accepts the string form a realtime payload delivers", () => {
    expect(
      resolveMessagingWindowOpenedAt({
        messageType: "incoming",
        createdAt: createdAt.toISOString(),
      }),
    ).toEqual(createdAt)
  })

  test("a call card opens it at the moment the server stamped, not when the card was written", () => {
    const openedAt = "2026-09-18T09:55:00.000Z"
    expect(
      resolveMessagingWindowOpenedAt({
        messageType: "activity",
        createdAt,
        contentAttributes: {
          type: "whatsapp_call",
          direction: "userInitiated",
          status: "failed",
          customerServiceWindowOpenedAt: openedAt,
        },
      }),
    ).toEqual(new Date(openedAt))
  })

  test("a call card without the stamp opens nothing", () => {
    expect(
      resolveMessagingWindowOpenedAt({
        messageType: "activity",
        createdAt,
        contentAttributes: {
          type: "whatsapp_call",
          direction: "businessInitiated",
          status: "failed",
        },
      }),
    ).toBeNull()
  })

  test.each([
    ["outgoing", undefined],
    ["activity", { type: "note" }],
    ["activity", undefined],
  ])("a %s message with %o opens nothing", (messageType, contentAttributes) => {
    expect(
      resolveMessagingWindowOpenedAt({
        messageType,
        createdAt,
        contentAttributes,
      }),
    ).toBeNull()
  })
})

describe("getWhatsappFlowResponse", () => {
  const entity = {
    type: "whatsapp_flow_response",
    name: "flow",
    flowResponse: { flow_token: "tok", name: "An" },
    flowToken: "tok",
    decoded: null,
  }

  test.each([
    ["a Flow completion", entity],
    ["a completion without a name", { ...entity, name: undefined }],
  ])("matches %s", (_label, value) => {
    expect(getWhatsappFlowResponse(value)).toBe(value)
  })

  test.each([
    ["no attributes", null],
    ["another type", { type: "template" }],
    ["an address answer", { ...entity, name: "address_message" }],
    ["a missing response", { ...entity, flowResponse: null }],
    ["an array response", { ...entity, flowResponse: [] }],
  ])("rejects %s", (_label, value) => {
    expect(getWhatsappFlowResponse(value)).toBeUndefined()
  })
})

describe("getViewCatalogEntity", () => {
  test("reads the marker the sender stamps on a view-catalog message", () => {
    expect(
      getViewCatalogEntity({ viewCatalog: { footer: "Free shipping" } }),
    ).toEqual({ footer: "Free shipping" })
  })

  test("accepts a marker without a footer", () => {
    expect(getViewCatalogEntity({ viewCatalog: {} })).toEqual({})
  })

  test("drops a footer that is not a string, so the inbox never renders an object", () => {
    expect(getViewCatalogEntity({ viewCatalog: { footer: { a: 1 } } })).toEqual(
      {},
    )
  })

  test.each([
    undefined,
    null,
    "viewCatalog",
    [],
    {},
    { viewCatalog: null },
    { viewCatalog: "yes" },
    { type: "template", payload: { templateType: "button", buttons: [] } },
  ])("returns undefined for %j", (contentAttributes) => {
    expect(getViewCatalogEntity(contentAttributes)).toBeUndefined()
  })
})

const catalogReference = {
  source: "metaCatalog",
  catalogId: "cat-1",
  retailerId: "sku-1",
} as const

describe("getInboundOrder", () => {
  test("reads the order stored under its own key, beside the raw channel fields", () => {
    const inboundOrder = {
      note: null,
      items: [
        {
          catalogReference,
          product: null,
          quantity: 2,
          itemPrice: 5,
          currency: "USD",
        },
      ],
    }
    expect(
      getInboundOrder({ catalog_id: "cat-1", product_items: [], inboundOrder }),
    ).toEqual(inboundOrder)
  })

  test.each([
    undefined,
    null,
    "inboundOrder",
    [],
    {},
    { inboundOrder: null },
    { inboundOrder: "yes" },
    { inboundOrder: { note: null } },
    { inboundOrder: { items: "none" } },
    // Caller-controlled on some channels: every field is checked, so a forged
    // or half-built entry can never reach a trigger, a payload or the inbox.
    { inboundOrder: { note: null, items: [] } },
    { inboundOrder: { note: null, items: [{}] } },
    { inboundOrder: { note: null, items: [{ catalogReference: null }] } },
    {
      inboundOrder: {
        note: null,
        items: [
          {
            catalogReference: {
              source: "unknown",
              catalogId: "c",
              retailerId: "r",
            },
            product: null,
            quantity: 1,
            itemPrice: 1,
            currency: "USD",
          },
        ],
      },
    },
    {
      inboundOrder: {
        note: null,
        items: [
          {
            catalogReference: {
              source: "metaCatalog",
              catalogId: "",
              retailerId: "r",
            },
            product: null,
            quantity: 1,
            itemPrice: 1,
            currency: "USD",
          },
        ],
      },
    },
    {
      inboundOrder: {
        note: null,
        items: [
          {
            catalogReference: {
              source: "metaCatalog",
              catalogId: "c",
              retailerId: "r",
            },
            product: { productId: 7 },
            quantity: 1,
            itemPrice: 1,
            currency: "USD",
          },
        ],
      },
    },
    {
      inboundOrder: {
        note: null,
        items: [
          {
            catalogReference: {
              source: "metaCatalog",
              catalogId: "c",
              retailerId: "r",
            },
            product: null,
            quantity: "2",
            itemPrice: 1,
            currency: "USD",
          },
        ],
      },
    },
  ])("returns undefined for %j", (contentAttributes) => {
    expect(getInboundOrder(contentAttributes)).toBeUndefined()
  })
})

describe("getReferredProduct", () => {
  test("keeps an unresolved product as null so the inbox can fall back to the retailer id", () => {
    const referredProduct = { catalogReference, product: null }
    expect(getReferredProduct({ referredProduct })).toEqual(referredProduct)
  })

  test.each([
    undefined,
    null,
    "referredProduct",
    [],
    {},
    { referredProduct: null },
    { referredProduct: "sku-1" },
    { referredProduct: { product: null } },
    { referredProduct: { catalogReference: null } },
    {
      referredProduct: {
        catalogReference: { source: "metaCatalog", catalogId: "c" },
        product: null,
      },
    },
    {
      referredProduct: {
        catalogReference: {
          source: "metaCatalog",
          catalogId: "c",
          retailerId: "r",
        },
        product: { name: "no id" },
      },
    },
    {
      referredProduct: {
        catalogReference: {
          source: "metaCatalog",
          catalogId: "c",
          retailerId: "r",
        },
      },
    },
  ])("returns undefined for %j", (contentAttributes) => {
    expect(getReferredProduct(contentAttributes)).toBeUndefined()
  })
})
