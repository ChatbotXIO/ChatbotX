import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

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

const templatePayload = () =>
  JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string) as {
    template: {
      components: Array<{
        type: string
        parameters: Array<{
          type: string
          text?: string
          parameter_name?: string
        }>
      }>
    }
  }

const componentOfType = (type: string) =>
  templatePayload().template.components.find((c) => c.type === type)

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
    expect(error.message).toContain("(#100) Invalid parameter")
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
