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

vi.mock("../src/client", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendMessage, sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const PHONE_NUMBER_ID = "pn-1"
const ctx = {
  auth: { metadata: { phoneNumber: { id: PHONE_NUMBER_ID } } },
} as never

const phoneKeyedContact = {
  id: "contact-1",
  sourceId: "84123456789",
} as never

const bsuidKeyedContact = {
  id: "contact-2",
  sourceId: "user.9373001",
  sourceUserId: "user.9373001",
} as never

const rawRequestBody = () =>
  JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string) as {
    to?: string
    recipient?: string
    type?: string
    text?: { body?: string }
    template?: unknown
  }

describe("WhatsApp sendMessage — BSUID recipient routing (D4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.lib-1" }],
    })
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.raw-1" }] }), {
        status: 200,
      }),
    )
  })

  test("phone-keyed contact: sends via the lib path with `to` (regression)", async () => {
    await sendMessage({
      ctx,
      data: {
        contact: phoneKeyedContact,
        message: { id: "msg-1", contentType: "text", text: "hello" },
      },
    } as never)

    expect(mockSendMessage).toHaveBeenCalledWith(
      PHONE_NUMBER_ID,
      "84123456789",
      expect.objectContaining({ body: "hello" }),
    )
    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  test("BSUID-keyed contact: routes through the raw poster with `recipient`, never `to` (regression Chatwoot hit)", async () => {
    await sendMessage({
      ctx,
      data: {
        contact: bsuidKeyedContact,
        message: { id: "msg-2", contentType: "text", text: "hello" },
      },
    } as never)

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    const body = rawRequestBody()
    expect(body.recipient).toBe("user.9373001")
    expect(body).not.toHaveProperty("to")
  })

  test("BSUID-keyed raw body shape pins a plain ClientMessage (Text) as {type, text} — verifies whatsapp-api-js serialization assumption (D4 verify item)", async () => {
    await sendMessage({
      ctx,
      data: {
        contact: bsuidKeyedContact,
        message: { id: "msg-3", contentType: "text", text: "pinned body" },
      },
    } as never)

    const body = rawRequestBody()
    expect(body.type).toBe("text")
    expect(body.text).toEqual({ body: "pinned body" })
  })
})

describe("WhatsApp sendFlowStep — BSUID recipient routing (D4)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.raw-1" }] }), {
        status: 200,
      }),
    )
    mockSendMessage.mockResolvedValue({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.lib-1" }],
    })
  })

  const sendTemplate = (contact: unknown) =>
    sendFlowStep({
      ctx,
      data: {
        contact,
        step: {
          id: "template-1",
          stepType: "sendWaTemplateMessage",
          template: { name: "happy_birthday", language: "en", params: {} },
        },
      },
    } as never)

  test("template (always raw path) to a phone-keyed contact: body has `to`, no `recipient` (regression)", async () => {
    await sendTemplate(phoneKeyedContact)

    const body = rawRequestBody()
    expect(body.to).toBe("84123456789")
    expect(body).not.toHaveProperty("recipient")
  })

  test("template (always raw path) to a BSUID-keyed contact: body has `recipient`, no `to`", async () => {
    await sendTemplate(bsuidKeyedContact)

    const body = rawRequestBody()
    expect(body.recipient).toBe("user.9373001")
    expect(body).not.toHaveProperty("to")
  })

  test("lib-path message (sendText step) to a BSUID-keyed contact is routed through the raw poster instead of the lib client", async () => {
    await sendFlowStep({
      ctx,
      data: {
        contact: bsuidKeyedContact,
        step: {
          id: "step-1",
          stepType: "sendText",
          text: "hi from a flow",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    const body = rawRequestBody()
    expect(body.recipient).toBe("user.9373001")
  })

  test("lib-path message (sendText step) to a phone-keyed contact stays on the lib client (regression)", async () => {
    await sendFlowStep({
      ctx,
      data: {
        contact: phoneKeyedContact,
        step: {
          id: "step-2",
          stepType: "sendText",
          text: "hi from a flow",
          buttons: [],
        },
      },
    } as never)

    expect(mockApiFetch).not.toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledWith(
      PHONE_NUMBER_ID,
      "84123456789",
      expect.objectContaining({ body: "hi from a flow" }),
    )
  })
})
