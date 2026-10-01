import {
  ChannelErrorCategory,
  ThreadControlTakeRefusedError,
} from "@chatbotx.io/sdk"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  envelope,
  handoverValue,
  PHONE_ID,
  standbyMessage,
  standbyValue,
  summaryContext,
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
const { conversationHandlers } = await import("../src/handlers/conversation")
const { mapToChannelError, THREAD_CONTROL_REJECTION_CODES } = await import(
  "../src/lib/error-mapper"
)
const { WhatsappException } = await import("../src/exception")
const { buildThreadControlBody } = await import("../src/api/thread-control")

afterEach(() => {
  vi.clearAllMocks()
})

const handlerCtx = {
  auth: {
    tokens: { accessToken: "tok" },
    version: "v23.0",
    metadata: { phoneNumber: { id: "pn-1" }, wabaId: "waba-1" },
  },
} as never

const receiveEvent = (payload: unknown) =>
  conversationHandlers.receiveThreadControlEvent({
    ctx: handlerCtx,
    data: {
      integrationType: "whatsapp",
      integrationIdentifier: PHONE_ID,
      payload,
    },
  } as never)

describe("updateThreadControl handler", () => {
  const okResponse = () => ({
    json: vi.fn().mockResolvedValue({ messaging_product: "whatsapp" }),
  })

  it.each([
    ["take", { to: USER, action: "take" }],
    ["release", { to: USER, action: "release" }],
    ["pass", { to: USER, action: "pass" }],
  ] as const)("posts %s to /{phone_number_id}/thread_control", async (action, expected) => {
    postMock.mockReturnValueOnce(okResponse())

    await conversationHandlers.updateThreadControl({
      ctx: handlerCtx,
      data: { contact: { id: "ci-1", sourceId: USER }, action },
    } as never)

    const [url, options] = postMock.mock.calls[0] ?? []
    expect(url).toContain("/v23.0/pn-1/thread_control")
    expect(options.headers.Authorization).toBe("Bearer tok")
    expect(options.json).toEqual({ messaging_product: "whatsapp", ...expected })
  })

  it.each([
    ["take", undefined, "escalation"],
    ["pass", undefined, "escalation"],
    ["pass", "customer_service", "customer_service"],
    ["release", undefined, null],
  ] as const)("returns the owner role after %s (target %s) → %s", async (action, targetRole, ownerRole) => {
    postMock.mockReturnValueOnce(okResponse())

    const result = await conversationHandlers.updateThreadControl({
      ctx: handlerCtx,
      data: { contact: { id: "ci-1", sourceId: USER }, action, targetRole },
    } as never)

    expect(result).toEqual({ ownerRole })
  })

  it("addresses a BSUID contact with recipient, never both to and recipient", async () => {
    postMock.mockReturnValueOnce(okResponse())

    await conversationHandlers.updateThreadControl({
      ctx: handlerCtx,
      data: {
        contact: { id: "ci-1", sourceId: "US.1", sourceUserId: "US.1" },
        action: "release",
      },
    } as never)

    const body = postMock.mock.calls[0]?.[1].json
    expect(body.recipient).toBe("US.1")
    expect("to" in body).toBe(false)
  })

  it("sends control_pass.target_role only for pass, and truncates metadata", () => {
    const recipient = { to: USER }

    expect(
      buildThreadControlBody({
        recipient,
        action: "pass",
        targetRole: "ai_agent",
        metadata: "x".repeat(2500),
      }),
    ).toMatchObject({
      control_pass: { target_role: "ai_agent" },
      metadata: "x".repeat(2000),
    })
    expect(
      "control_pass" in
        buildThreadControlBody({
          recipient,
          action: "release",
          targetRole: "ai_agent",
        }),
    ).toBe(false)
    expect(
      "control_pass" in buildThreadControlBody({ recipient, action: "pass" }),
    ).toBe(false)
  })

  const rejectWithMetaCode = (code: number) =>
    postMock.mockReturnValueOnce({
      json: vi
        .fn()
        .mockRejectedValue(
          new WhatsappException("Refused", 400, code, null, "OAuthException"),
        ),
    })

  const runAction = (action: "take" | "release") =>
    conversationHandlers.updateThreadControl({
      ctx: handlerCtx,
      data: { contact: { id: "ci-1", sourceId: USER }, action },
    } as never)

  it("throws Meta's 2494191 on a take as ThreadControlTakeRefusedError (PERMISSION_DENIED)", async () => {
    rejectWithMetaCode(2_494_191)

    const error = await runAction("take").catch((err: unknown) => err)

    expect(error).toBeInstanceOf(ThreadControlTakeRefusedError)
    expect(error).toMatchObject({
      category: ChannelErrorCategory.PERMISSION_DENIED,
      code: 2_494_191,
    })
  })

  it("keeps any other take refusal a plain channel error", async () => {
    rejectWithMetaCode(10)

    const error = await runAction("take").catch((err: unknown) => err)

    expect(error).not.toBeInstanceOf(ThreadControlTakeRefusedError)
    expect(error).toMatchObject({ code: 10 })
  })

  it("never marks a non-take action as a take refusal", async () => {
    rejectWithMetaCode(2_494_191)

    const error = await runAction("release").catch((err: unknown) => err)

    expect(error).not.toBeInstanceOf(ThreadControlTakeRefusedError)
  })
})

describe("receiveThreadControlEvent handler", () => {
  it("returns a handover result for a handover job", async () => {
    const value = handoverValue("control_passed", {
      previous_owner_role: "ai_agent",
      new_owner_role: "escalation",
      conversation_context: summaryContext,
    })

    const result = await receiveEvent({ kind: "handover", body: value })

    expect(result).toMatchObject({
      kind: "handover",
      event: { event: "controlPassed", newOwnerRole: "escalation" },
    })
  })

  it.each([
    "standbyMessage",
    "standbyEcho",
  ] as const)("returns the body unchanged for a %s job", async (kind) => {
    const [item] = extractConversationRoutingPayloads(
      envelope(
        standbyValue(
          kind === "standbyMessage"
            ? { messages: [standbyMessage("wamid.k")] }
            : { message_echoes: [textEcho("wamid.k")] },
        ),
        "standby",
      ),
    )

    const result = await receiveEvent({ kind, body: item?.body })

    expect(result).toEqual({
      kind: "standbyMessage",
      receivePayload: item?.body,
    })
  })

  it.each([
    ["a non-object payload", "x"],
    ["an unknown kind", { kind: "bogus", body: {} }],
    [
      "a malformed handover",
      { kind: "handover", body: { type: "control_lost" } },
    ],
    [
      "a malformed standby body",
      { kind: "standbyMessage", body: { phoneID: 1 } },
    ],
  ])("returns null for %s", async (_name, payload) => {
    await expect(receiveEvent(payload)).resolves.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Error mapper
// ---------------------------------------------------------------------------

describe("error mapper thread-control codes", () => {
  it("maps 2494191 to PERMISSION_DENIED (permanent)", () => {
    const error = mapToChannelError(
      new WhatsappException("x", 400, 2_494_191, null, "OAuthException"),
    )

    expect(error.category).toBe(ChannelErrorCategory.PERMISSION_DENIED)
  })

  it("keeps THREAD_CONTROL_REJECTION_CODES empty until Meta publishes the code (R1)", () => {
    expect(THREAD_CONTROL_REJECTION_CODES.size).toBe(0)
  })
})
