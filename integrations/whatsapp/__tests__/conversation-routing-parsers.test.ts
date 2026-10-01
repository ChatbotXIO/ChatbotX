import { afterEach, describe, expect, it, vi } from "vitest"
import {
  contactFor,
  envelope,
  handoverValue,
  historyContext,
  PHONE_ID,
  standbyMessage,
  standbyValue,
  summaryContext,
  templateEcho,
  textEcho,
  USER,
} from "./conversation-routing-fixtures"

const { handlePostMock, postMock } = vi.hoisted(() => ({
  handlePostMock: vi.fn<() => Promise<number>>(),
  postMock: vi.fn(),
}))

vi.mock("whatsapp-api-js/middleware/next", () => ({
  WhatsAppAPI: class {
    on: Record<string, unknown> = { message: null, sent: null, status: null }
    get = vi.fn().mockResolvedValue("ok")
    handle_post = handlePostMock
  },
}))

vi.mock("@chatbotx.io/utils/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils/crypto")>()),
  verifyHmacSha256Signature: vi.fn().mockResolvedValue(true),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock, create: vi.fn(() => ({})) },
    HTTPError: actual.HTTPError,
  }
})

vi.mock("../src/client", () => ({ getWhatsappClient: vi.fn(() => ({})) }))

const { extractConversationRoutingPayloads } = await import(
  "../src/handlers/webhook"
)
const {
  parseConversationContext,
  parseHandoverEvent,
  parseStandbyEcho,
  renderTemplateEcho,
} = await import("../src/lib/conversation-routing")
const { messageHandlers } = await import("../src/handlers/message")

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

describe("parseConversationContext", () => {
  it("parses the official summary shape", () => {
    expect(parseConversationContext(summaryContext)).toEqual({
      type: "summary",
      text: "Customer wants to change the delivery address.",
    })
  })

  it("parses the PDF history shape, mapping sender_type and skipping empty items", () => {
    expect(parseConversationContext(historyContext)).toEqual({
      type: "history",
      items: [
        { sender: "user", text: "Where is my order?", timestamp: "1755690000" },
        {
          sender: "business",
          text: "It ships today.",
          timestamp: "1755690060",
        },
        { sender: "user", text: "[image]" },
      ],
    })
  })

  it("renders a business template history item through the template definition", () => {
    const echo = templateEcho("wamid.h")
    const context = parseConversationContext({
      type: "history",
      history: {
        items: [
          {
            sender_type: "business",
            timestamp: "1755690060",
            message_echo: { message: echo.message, template: echo.template },
          },
        ],
      },
    })

    expect(context).toEqual({
      type: "history",
      items: [
        {
          sender: "business",
          text: "[image]\nHi Maria, enjoy 25% off!",
          timestamp: "1755690060",
        },
      ],
    })
  })

  it.each([
    ["absent", undefined],
    ["null", null],
    ["a blank summary", { type: "summary", summary: { text: "  " } }],
    ["an empty history", { type: "history", history: { items: [] } }],
    ["an unknown type", { type: "transcript", transcript: {} }],
    ["a non-object", "summary"],
    ["a summary without text", { type: "summary", summary: {} }],
  ])("returns undefined for %s", (_name, value) => {
    expect(parseConversationContext(value)).toBeUndefined()
  })
})

describe("parseHandoverEvent", () => {
  const now = new Date("2026-01-01T00:00:00Z")

  it("parses control_passed with summary context and note", () => {
    const event = parseHandoverEvent(
      handoverValue("control_passed", {
        previous_owner_role: "ai_agent",
        new_owner_role: "escalation",
        metadata: "user requested human",
        conversation_context: summaryContext,
      }),
      now,
    )

    expect(event).toEqual({
      contact: { sourceId: USER },
      event: "controlPassed",
      resumeEligible: true,
      previousOwnerRole: "ai_agent",
      newOwnerRole: "escalation",
      handoverNote: "user requested human",
      context: { type: "summary", text: expect.any(String) },
      occurredAt: new Date(1_755_700_100 * 1000),
    })
  })

  it("keeps the handover when metadata is not a string (drops only the note)", () => {
    const event = parseHandoverEvent(
      handoverValue("control_passed", {
        new_owner_role: "escalation",
        // Meta documents metadata as a string; a stray non-string must degrade
        // to no note rather than dropping the whole ownership change.
        metadata: { unexpected: "shape" } as unknown as string,
        conversation_context: summaryContext,
      }),
      now,
    )

    expect(event?.event).toBe("controlPassed")
    expect(event?.newOwnerRole).toBe("escalation")
    expect(event?.handoverNote).toBeUndefined()
    expect(event?.context).toEqual({
      type: "summary",
      text: expect.any(String),
    })
  })

  it("parses control_taken without context and ignores a context on it", () => {
    const event = parseHandoverEvent(
      handoverValue("control_taken", {
        previous_owner_role: "customer_service",
        new_owner_role: "escalation",
        conversation_context: summaryContext,
      }),
      now,
    )

    expect(event?.event).toBe("controlTaken")
    // control_taken never starts the resume flow (resume gate regression).
    expect(event?.resumeEligible).toBeUndefined()
    expect(event?.context).toBeUndefined()
    expect(event?.handoverNote).toBeUndefined()
  })

  it("maps an unknown role to null and captures previous_owner_app_id", () => {
    const event = parseHandoverEvent(
      handoverValue("control_passed", {
        previous_owner_role: "brand_new_role",
        previous_owner_app_id: "123",
        new_owner_role: "escalation",
      }),
      now,
    )

    expect(event?.previousOwnerRole).toBeNull()
    expect(event?.newOwnerRole).toBe("escalation")
    expect(event?.previousOwnerAppId).toBe("123")
  })

  it("captures both owner app ids and coerces a numeric id to a string", () => {
    const event = parseHandoverEvent(
      handoverValue("control_passed", {
        previous_owner_app_id: 1_234_567_890_123_456,
        new_owner_app_id: "9876543210",
      }),
      now,
    )

    expect(event?.previousOwnerAppId).toBe("1234567890123456")
    expect(event?.newOwnerAppId).toBe("9876543210")
  })

  it("omits the owner app ids when the payload carries none", () => {
    const event = parseHandoverEvent(
      handoverValue("control_passed", { new_owner_role: "escalation" }),
      now,
    )

    expect(event).not.toBeNull()
    expect(event).not.toHaveProperty("previousOwnerAppId")
    expect(event).not.toHaveProperty("newOwnerAppId")
  })

  it("accepts the PDF's *_app_role keys and normalises META_AI to ai_agent", () => {
    const event = parseHandoverEvent(
      handoverValue("control_passed", {
        previous_owner_app_role: "META_AI",
        new_owner_app_role: "ESCALATION",
      }),
      now,
    )

    expect(event?.previousOwnerRole).toBe("ai_agent")
    expect(event?.newOwnerRole).toBe("escalation")
  })

  it("parses the PDF control_passed payload verbatim", () => {
    const event = parseHandoverEvent({
      messaging_product: "whatsapp",
      sender: { phone_number: USER },
      recipient: { phone_number_id: PHONE_ID, display_phone_number: "1555" },
      timestamp: "1697041663",
      type: "control_passed",
      control_passed: {
        previous_owner_app_id: "1234567890123456",
        previous_owner_app_role: "META_AI",
        metadata: "Information about the conversation",
        conversation_context: summaryContext,
      },
    })

    expect(event).toMatchObject({
      event: "controlPassed",
      previousOwnerRole: "ai_agent",
      previousOwnerAppId: "1234567890123456",
      newOwnerRole: null,
      handoverNote: "Information about the conversation",
      context: { type: "summary" },
      occurredAt: new Date(1_697_041_663_000),
    })
  })

  it("prefers the official role key over the PDF alias", () => {
    const event = parseHandoverEvent(
      handoverValue("control_passed", {
        previous_owner_role: "customer_service",
        previous_owner_app_role: "META_AI",
      }),
      now,
    )

    expect(event?.previousOwnerRole).toBe("customer_service")
  })

  it("keys a BSUID-only sender by its user id", () => {
    const value = {
      ...handoverValue("control_passed", { new_owner_role: "escalation" }),
      sender: { user_id: "US.123" },
    }

    expect(parseHandoverEvent(value, now)?.contact).toEqual({
      sourceId: "US.123",
      sourceUserId: "US.123",
    })
  })

  it("falls back to the clock for a missing timestamp", () => {
    const value = {
      ...handoverValue("control_taken", {}),
      timestamp: undefined,
    }

    expect(parseHandoverEvent(value, now)?.occurredAt).toEqual(now)
  })

  it.each([
    [
      "an unknown type",
      { type: "control_lost", sender: { phone_number: USER } },
    ],
    ["no sender identity", { type: "control_taken", sender: {} }],
    ["a non-object", "x"],
  ])("returns null for %s", (_name, value) => {
    expect(parseHandoverEvent(value, now)).toBeNull()
  })
})

describe("renderTemplateEcho", () => {
  const echo = templateEcho("wamid.t")

  it("substitutes {{n}} with the sent parameters and prefixes a media header", () => {
    expect(renderTemplateEcho(echo.template, echo.message.template)).toBe(
      "[image]\nHi Maria, enjoy 25% off!",
    )
  })

  it("renders a TEXT header with its own parameters", () => {
    const text = renderTemplateEcho(
      {
        components: [
          { type: "HEADER", format: "TEXT", text: "Order {{1}}" },
          { type: "BODY", text: "Total {{1}}" },
        ],
      },
      {
        name: "t",
        components: [
          { type: "header", parameters: [{ type: "text", text: "#77" }] },
          { type: "body", parameters: [{ type: "text", text: "$9" }] },
        ],
      },
    )

    expect(text).toBe("Order #77\nTotal $9")
  })

  it("supports named parameters and keeps an unfilled placeholder", () => {
    const text = renderTemplateEcho(
      { components: [{ type: "BODY", text: "Hi {{name}} and {{2}}" }] },
      {
        name: "t",
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "Ann", parameter_name: "name" }],
          },
        ],
      },
    )

    expect(text).toBe("Hi Ann and {{2}}")
  })

  it("falls back to the template name without a definition or body", () => {
    expect(renderTemplateEcho(undefined, { name: "promo" })).toBe(
      "[template] promo",
    )
    expect(
      renderTemplateEcho(
        { components: [{ type: "HEADER", format: "IMAGE" }] },
        { name: "promo" },
      ),
    ).toBe("[template] promo")
  })
})

describe("parseStandbyEcho", () => {
  it("builds an outgoing third-party-safe message from a text echo", () => {
    const parsed = parseStandbyEcho(textEcho("wamid.e"))

    expect(parsed.message).toMatchObject({
      sourceId: "wamid.e",
      messageType: "outgoing",
      text: "Your order has shipped.",
      contentAttributes: { threadControlEcho: true },
    })
    expect(parsed.contact).toEqual({ sourceId: USER })
  })

  it("renders a template echo and addresses a BSUID recipient", () => {
    const echo = templateEcho("wamid.t")
    const bsuidEcho = {
      ...echo,
      message: { ...echo.message, to: undefined, recipient: "US.9" },
    }

    const parsed = parseStandbyEcho(bsuidEcho)

    expect(parsed.message.text).toBe("[image]\nHi Maria, enjoy 25% off!")
    expect(parsed.contact).toEqual({ sourceId: "US.9", sourceUserId: "US.9" })
  })

  it("labels media and interactive echoes instead of downloading them", () => {
    const media = parseStandbyEcho({
      id: "m",
      message: { to: USER, type: "image", image: { link: "https://x/y.png" } },
    })
    const interactive = parseStandbyEcho({
      id: "i",
      message: {
        to: USER,
        type: "interactive",
        interactive: { body: { text: "Pick one" } },
      },
    })

    expect(media.message.text).toBe("[image]")
    expect(interactive.message.text).toBe("Pick one")
  })
})

// ---------------------------------------------------------------------------
// receiveMessage (parse output for messages / standby)
// ---------------------------------------------------------------------------

const receive = (payload: unknown) =>
  messageHandlers.receiveMessage({
    ctx: { auth: {} },
    data: {
      integrationType: "whatsapp",
      integrationIdentifier: PHONE_ID,
      payload,
    },
  } as never)

const messagesPayload = (valueExtra: Record<string, unknown> = {}) => {
  const message = standbyMessage("wamid.owner")
  return {
    phoneID: PHONE_ID,
    from: USER,
    message,
    name: "Test User",
    raw: envelope(
      {
        metadata: { phone_number_id: PHONE_ID },
        contacts: [contactFor()],
        messages: [message],
        ...valueExtra,
      },
      "messages",
    ),
  }
}

describe("receiveMessage threadControl", () => {
  it("marks a messages delivery as owner without context", async () => {
    const result = await receive(messagesPayload())

    expect(result.threadControl).toEqual({
      delivery: "owner",
      occurredAt: expect.any(Date),
    })
    expect(result.message?.messageType).toBe("incoming")
  })

  it("carries a summary context on an owner delivery", async () => {
    const result = await receive(
      messagesPayload({ conversation_context: summaryContext }),
    )

    expect(result.threadControl).toEqual({
      delivery: "owner",
      context: { type: "summary", text: expect.any(String) },
      occurredAt: expect.any(Date),
    })
  })

  it("carries a history context on an owner delivery", async () => {
    const result = await receive(
      messagesPayload({ conversation_context: historyContext }),
    )

    expect(result.threadControl?.context).toMatchObject({ type: "history" })
  })

  it("marks a standby message as standby with the sender identity", async () => {
    const [item] = extractConversationRoutingPayloads(
      envelope(
        standbyValue({
          contacts: [{ ...contactFor(), user_id: "US.5" }],
          messages: [standbyMessage("wamid.sb")],
        }),
        "standby",
      ),
    )

    const result = await receive(item?.body)

    expect(result.threadControl).toEqual({
      delivery: "standby",
      occurredAt: new Date(1_755_700_000 * 1000),
    })
    expect(result.message).toMatchObject({
      sourceId: "wamid.sb",
      messageType: "incoming",
      text: "Test standby message",
    })
    expect(result.contact).toMatchObject({
      sourceId: USER,
      sourceUserId: "US.5",
    })
    expect(result.echoOrigin).toBeUndefined()
  })

  it("parses a standby echo as an outgoing third-party echo", async () => {
    const [item] = extractConversationRoutingPayloads(
      envelope(
        standbyValue({ message_echoes: [templateEcho("wamid.tpl")] }),
        "standby",
      ),
    )

    const result = await receive(item?.body)

    expect(result).toMatchObject({
      threadControl: { delivery: "standby" },
      echoOrigin: "thirdParty",
      message: {
        sourceId: "wamid.tpl",
        messageType: "outgoing",
        text: "[image]\nHi Maria, enjoy 25% off!",
        contentAttributes: { threadControlEcho: true },
      },
      contact: { sourceId: USER },
    })
  })
})
