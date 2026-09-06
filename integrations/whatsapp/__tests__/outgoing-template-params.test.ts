import type { TemplateComponent } from "@chatbotx.io/flow-config"
import {
  bindWaTemplateQuickReplyButtons,
  buttonStepDefaultFn,
  decodeButtonPayload,
  decodeTemplateFlowToken,
  encodeButtonPayload,
  extractTemplateParams,
  seedWaTemplateStepButtons,
  TemplateFlowOrigin,
} from "@chatbotx.io/flow-config"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { readTemplateButtonReply } from "../src/handlers/message/incoming-reply"

const { mockApiFetch, mockGetWhatsappClient, mockLogger } = vi.hoisted(() => {
  const apiFetch = vi.fn()
  return {
    mockApiFetch: apiFetch,
    mockGetWhatsappClient: vi.fn(() => ({
      $$apiFetch$$: apiFetch,
      sendMessage: vi.fn(),
    })),
    mockLogger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }
})

vi.mock("../src/client", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

vi.mock("../src/lib/logger", () => ({
  logger: mockLogger,
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const PHONE_NUMBER_ID = "pn-1"

const ctx = {
  auth: { metadata: { phoneNumber: { id: PHONE_NUMBER_ID } } },
} as never

const contact = { id: "contact-1", sourceId: "84123456789" } as never

type TemplateParams = Record<string, unknown>

const sendTemplate = (params: TemplateParams) =>
  sendFlowStep({
    ctx,
    data: {
      contact,
      step: {
        id: "template-1",
        stepType: "sendWaTemplateMessage",
        template: { name: "happy_birthday", language: "en", params },
      },
    },
  } as never)

const sendFlowTemplate = (
  params: TemplateParams,
  data: Record<string, unknown>,
) =>
  sendFlowStep({
    ctx,
    data: {
      contact,
      ...data,
      step: {
        id: "11612473309626370",
        stepType: "sendWaTemplateMessage",
        template: { name: "feedback", language: "en", params },
      },
    },
  } as never)

type TemplatePayloadComponent = {
  type: string
  sub_type?: string
  index?: number
  parameters: Array<{
    type: string
    text?: string
    payload?: string
    parameter_name?: string
    action?: {
      flow_token?: string
      flow_action_data?: Record<string, unknown>
    }
  }>
  cards?: Array<{
    card_index: number
    components: TemplatePayloadComponent[]
  }>
}

const templatePayload = () =>
  JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string) as {
    template: {
      components: TemplatePayloadComponent[]
    }
  }

const componentOfType = (type: string) =>
  templatePayload().template.components.find((c) => c.type === type)

const componentsOfType = (type: string) =>
  templatePayload().template.components.filter((c) => c.type === type)

describe("whatsapp outgoing template parameters", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.raw-1" }] }), {
        status: 200,
      }),
    )
  })

  test("NAMED body param carries parameter_name to Meta", async () => {
    await sendTemplate({
      body: [{ type: "text", text: "Hung Phan", parameter_name: "user_name" }],
    })

    expect(componentOfType("body")?.parameters).toEqual([
      { type: "text", text: "Hung Phan", parameter_name: "user_name" },
    ])
  })

  test("POSITIONAL body param omits parameter_name (no regression)", async () => {
    await sendTemplate({ body: [{ type: "text", text: "Order 123" }] })

    const [param] = componentOfType("body")?.parameters ?? []
    expect(param).toEqual({ type: "text", text: "Order 123" })
    expect(param).not.toHaveProperty("parameter_name")
  })

  test("NAMED header text param carries parameter_name", async () => {
    await sendTemplate({
      header: [{ type: "text", text: "ACME", parameter_name: "store_name" }],
    })

    expect(componentOfType("header")?.parameters).toEqual([
      { type: "text", text: "ACME", parameter_name: "store_name" },
    ])
  })

  test("mixed named body params each keep their own parameter_name", async () => {
    await sendTemplate({
      body: [
        { type: "text", text: "Alice", parameter_name: "first_name" },
        { type: "text", text: "A-9", parameter_name: "order_id" },
      ],
    })

    expect(componentOfType("body")?.parameters).toEqual([
      { type: "text", text: "Alice", parameter_name: "first_name" },
      { type: "text", text: "A-9", parameter_name: "order_id" },
    ])
  })

  test("FLOW button generates a flow-step token and omits empty flow_action_data", async () => {
    await sendFlowTemplate(
      {
        button: [
          {
            sub_type: "flow",
            index: 0,
            flowSourceId: "meta-flow-1",
            navigateScreenId: "SCREEN_1",
            fieldMappings: [],
          },
        ],
      },
      {
        flowId: "11612473309626368",
        flowVersionId: "11612473309626369",
      },
    )

    const [param] = componentOfType("button")?.parameters ?? []
    const token = param?.action?.flow_token

    expect(token).toBeTruthy()
    expect(param?.action).not.toHaveProperty("flow_action_data")
    expect(decodeTemplateFlowToken(token)).toEqual({
      origin: TemplateFlowOrigin.FlowStep,
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      stepId: "11612473309626370",
      buttonIndex: 0,
    })
  })

  test("FLOW button generates a broadcast token from metadata", async () => {
    await sendFlowTemplate(
      {
        button: [
          {
            sub_type: "flow",
            index: 1,
            flowSourceId: "meta-flow-1",
            navigateScreenId: "SCREEN_1",
            fieldMappings: [],
          },
        ],
      },
      {
        flowId: "",
        metadata: { broadcastId: "11612473309626371" },
      },
    )

    const [param] = componentOfType("button")?.parameters ?? []

    expect(decodeTemplateFlowToken(param?.action?.flow_token)).toEqual({
      origin: TemplateFlowOrigin.Broadcast,
      broadcastId: "11612473309626371",
      buttonIndex: 1,
    })
  })
})

describe("button component hygiene", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.raw-1" }] }), {
        status: 200,
      }),
    )
  })

  test("quick reply with a blank payload emits NO button component (Meta rejects payload: '')", async () => {
    await sendTemplate({
      body: [{ type: "text", text: "Hello" }],
      button: [{ sub_type: "quick_reply", index: 1, payload: "" }],
    })

    expect(componentsOfType("button")).toEqual([])
  })

  test("quick reply with a whitespace-only payload is also omitted", async () => {
    await sendTemplate({
      button: [{ sub_type: "quick_reply", index: 0, payload: "   " }],
    })

    expect(componentsOfType("button")).toEqual([])
  })

  test("quick reply with a real payload is sent byte-for-byte with its template index", async () => {
    await sendTemplate({
      button: [{ sub_type: "quick_reply", index: 1, payload: " f1:v1:btn-9 " }],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "quick_reply",
        index: 1,
        parameters: [{ type: "payload", payload: " f1:v1:btn-9 " }],
      },
    ])
  })

  test("legacy duplicate quick reply entries collapse to the one carrying content", async () => {
    // Shape persisted by the old form: a stale blank entry plus the entry the
    // visible input actually wrote, both at the same template index.
    await sendTemplate({
      button: [
        { sub_type: "quick_reply", index: 1, payload: "" },
        { sub_type: "quick_reply", index: 1, payload: "KEEP" },
      ],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "quick_reply",
        index: 1,
        parameters: [{ type: "payload", payload: "KEEP" }],
      },
    ])
  })

  test("legacy duplicate dynamic-URL entries collapse to the one carrying text", async () => {
    await sendTemplate({
      button: [
        { sub_type: "url", index: 1, text: "" },
        { sub_type: "url", index: 1, text: "summer-sale" },
      ],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "url",
        index: 1,
        parameters: [{ type: "text", text: "summer-sale" }],
      },
    ])
  })

  test("null holes from sparse form arrays are skipped without crashing or shifting indexes", async () => {
    await sendTemplate({
      button: [null, { sub_type: "url", index: 1, text: "suffix" }],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "url",
        index: 1,
        parameters: [{ type: "text", text: "suffix" }],
      },
    ])
  })

  test("a lone dynamic-URL entry with empty text is still emitted (missing suffix must surface as an error)", async () => {
    await sendTemplate({
      button: [{ sub_type: "url", index: 0, text: "" }],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "url",
        index: 0,
        parameters: [{ type: "text", text: "" }],
      },
    ])
  })

  test("entries without an explicit index keep their positional fallback and never collapse", async () => {
    await sendTemplate({
      button: [
        { sub_type: "url", text: "a" },
        { sub_type: "url", text: "b" },
      ],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "url",
        index: 0,
        parameters: [{ type: "text", text: "a" }],
      },
      {
        type: "button",
        sub_type: "url",
        index: 1,
        parameters: [{ type: "text", text: "b" }],
      },
    ])
  })

  test("catalog button with a blank thumbnail emits NO button component (Meta default thumbnail applies)", async () => {
    await sendTemplate({
      button: [
        { sub_type: "catalog", index: 0, thumbnail_product_retailer_id: "" },
      ],
    })

    expect(componentsOfType("button")).toEqual([])
  })

  test("catalog button with a whitespace-only thumbnail is also omitted", async () => {
    await sendTemplate({
      button: [
        {
          sub_type: "catalog",
          index: 0,
          thumbnail_product_retailer_id: "   ",
        },
      ],
    })

    expect(componentsOfType("button")).toEqual([])
  })

  test("catalog button with a real thumbnail is sent exactly as before (regression)", async () => {
    await sendTemplate({
      button: [
        {
          sub_type: "catalog",
          index: 0,
          thumbnail_product_retailer_id: "sku-123",
        },
      ],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "catalog",
        index: 0,
        parameters: [
          {
            type: "action",
            action: { thumbnail_product_retailer_id: "sku-123" },
          },
        ],
      },
    ])
  })

  test("MPM button with configured sections is emitted unchanged", async () => {
    await sendTemplate({
      button: [
        {
          sub_type: "mpm",
          index: 0,
          sections: [
            {
              title: "Best sellers",
              product_items: [
                { product_retailer_id: "sku-1" },
                { product_retailer_id: "sku-2" },
              ],
            },
            {
              title: "New arrivals",
              product_items: [{ product_retailer_id: "sku-3" }],
            },
          ],
        },
      ],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "mpm",
        index: 0,
        parameters: [
          {
            type: "action",
            action: {
              sections: [
                {
                  title: "Best sellers",
                  product_items: [
                    { product_retailer_id: "sku-1" },
                    { product_retailer_id: "sku-2" },
                  ],
                },
                {
                  title: "New arrivals",
                  product_items: [{ product_retailer_id: "sku-3" }],
                },
              ],
            },
          },
        ],
      },
    ])
  })

  test("carousel card quick replies with blank payloads are omitted from the card", async () => {
    await sendTemplate({
      carousel: [
        {
          card_index: 0,
          body: [{ type: "text", text: "Card body" }],
          button: [
            { sub_type: "quick_reply", index: 0, payload: "" },
            { sub_type: "url", index: 1, text: "card-suffix" },
          ],
        },
      ],
    })

    const card = componentOfType("carousel")?.cards?.[0]
    const cardButtons =
      card?.components.filter((c) => c.type === "button") ?? []
    expect(cardButtons).toEqual([
      {
        type: "button",
        sub_type: "url",
        index: 1,
        parameters: [{ type: "text", text: "card-suffix" }],
      },
    ])
  })
})

describe("customer scenario — approved template with static URL + quick reply (error #132018)", () => {
  // Exact component shape of the customer's APPROVED template that failed in
  // production: IMAGE header, 3 positional body variables, static URL button
  // at index 0, quick-reply button at index 1.
  const customerComponents = [
    { type: "HEADER", format: "IMAGE" },
    {
      type: "BODY",
      text: "Olá, {{1}}\n\n{{2}}\n\n{{3}}\n\nPara mais informações, clique no botão abaixo.",
    },
    {
      type: "BUTTONS",
      buttons: [
        {
          url: "https://sfvtwj.short.gy/a7awnm0p",
          text: "Clique aqui",
          type: "URL",
        },
        { text: "Parar mensagens", type: "QUICK_REPLY" },
      ],
    },
  ] as unknown as TemplateComponent[]

  // What the broadcast/flow form produces after template selection: seeded
  // defaults from the real extractor, then the user's typed values.
  const filledCustomerParams = () => {
    const params = extractTemplateParams(customerComponents)
    return {
      ...params,
      header: [{ type: "image", image: { link: "https://cdn.example/x.png" } }],
      body: params.body?.map((param, position) => ({
        ...param,
        text: `${position + 1}`,
      })),
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.raw-1" }] }), {
        status: 200,
      }),
    )
  })

  test("broadcast send produces the exact Graph payload Meta accepts — no button components at all", async () => {
    await sendTemplate(filledCustomerParams())

    expect(templatePayload().template.components).toEqual([
      {
        type: "header",
        parameters: [
          { type: "image", image: { link: "https://cdn.example/x.png" } },
        ],
      },
      {
        type: "body",
        parameters: [
          { type: "text", text: "1" },
          { type: "text", text: "2" },
          { type: "text", text: "3" },
        ],
      },
    ])
  })

  test("flow send routes the quick reply end-to-end: seeded button → Graph payload → inbound postback", async () => {
    // Real seeding exactly as the flow editor does it.
    const stepButtons = seedWaTemplateStepButtons(
      [
        buttonStepDefaultFn({ label: "Delivered" }),
        buttonStepDefaultFn({ label: "Failed" }),
      ],
      customerComponents,
    )
    // Real binding + encoding exactly as the worker does it.
    const [binding] = bindWaTemplateQuickReplyButtons(
      customerComponents,
      stepButtons,
    )
    const postback = encodeButtonPayload({
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      buttonId: binding.stepButton.id,
    })

    await sendTemplate({
      ...filledCustomerParams(),
      button: [{ sub_type: "quick_reply", index: 1, payload: postback }],
    })

    expect(componentsOfType("button")).toEqual([
      {
        type: "button",
        sub_type: "quick_reply",
        index: 1,
        parameters: [{ type: "payload", payload: postback }],
      },
    ])

    // Meta echoes the payload back in messages.button.payload — verify the
    // real inbound parser + payload codec route it to the seeded button.
    const reply = readTemplateButtonReply({
      payload: postback,
      text: "Parar mensagens",
    })
    expect(reply.postbackAction).toBe(postback)
    expect(decodeButtonPayload(reply.postbackAction ?? "")).toEqual({
      flowId: "11612473309626368",
      flowVersionId: "11612473309626369",
      buttonId: binding.stepButton.id,
    })
  })

  test("a tap on a quick reply sent WITHOUT payload (broadcast) falls back to the button text", () => {
    const reply = readTemplateButtonReply({
      payload: "Parar mensagens",
      text: "Parar mensagens",
    })

    // Not a flow postback — the worker's sanitizeFlowAction drops it and the
    // message is handled as plain text by keyword automation.
    expect(decodeButtonPayload(reply.postbackAction ?? "")).toBeNull()
    expect(reply.text).toBe("Parar mensagens")
  })
})

describe("raw Meta error surfacing", () => {
  const metaErrorBody = {
    error: {
      message: "(#100) Invalid parameter",
      code: 100,
      type: "OAuthException",
      error_data: {
        messaging_product: "whatsapp",
        details: "Parameter name is missing or empty",
      },
      fbtrace_id: "trace-xyz",
    },
  }

  const rejectWith = (status: number) => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify(metaErrorBody), { status }),
    )
    return sendTemplate({
      body: [{ type: "text", text: "x", parameter_name: "user_name" }],
    }).catch((error) => error as ChannelError)
  }

  test("exposes the real Meta code instead of unknown -1", async () => {
    const error = await rejectWith(400)
    expect(error).toBeInstanceOf(ChannelError)
    expect(error.code).toBe(100)
    // Meta's own `(#100) ` prefix is folded into the one `#(code) ` prefix the
    // formatter writes, so the code still reads once, not twice.
    expect(error.message).toContain("#(100) Invalid parameter")
    expect(error.message).not.toContain("#(100) (#100)")
  })

  test("getErrorData reports the real code and a categorized (non-unknown) error", async () => {
    const error = await rejectWith(400)
    const data = await error.getErrorData()
    expect(data.code).toBe(100)
    expect(data.category).not.toBe(ChannelErrorCategory.UNKNOWN)
  })

  test("carries error_data.details as the user-facing message and keeps the fbtrace id", async () => {
    const error = await rejectWith(400)
    expect(error.getOriginError()).toMatchObject({
      userMessage: "Parameter name is missing or empty",
      fbtraceId: "trace-xyz",
    })
  })
})
