// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockConnectMessengerPage,
  mockConnectInstagramAccountViaFacebook,
  mockConnectInstagramAccount,
  mockConnectWhatsappNumber,
} = vi.hoisted(() => ({
  mockConnectMessengerPage: vi.fn(),
  mockConnectInstagramAccountViaFacebook: vi.fn(),
  mockConnectInstagramAccount: vi.fn(),
  mockConnectWhatsappNumber: vi.fn(),
}))

vi.mock("@/features/integration-messenger/actions/connect-page", () => ({
  connectMessengerPage: mockConnectMessengerPage,
}))
vi.mock(
  "@/features/integration-instagram/actions/connect-account-facebook",
  () => ({
    connectInstagramAccountViaFacebook: mockConnectInstagramAccountViaFacebook,
  }),
)
vi.mock("@/features/integration-instagram/actions/connect-account", () => ({
  connectInstagramAccount: mockConnectInstagramAccount,
}))
vi.mock("@/features/integration-whatsapp/actions/connect-number", () => ({
  connectWhatsappNumber: mockConnectWhatsappNumber,
}))

vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        session: { id: "sess-1" },
        user: { id: "user-1", email: "test@test.com", isAnonymous: false },
      })),
    },
  },
}))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

const { call } = await import("@orpc/server")
const { getAuditActor } = await import("@chatbotx.io/business/audit")
const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { integrationMessengerConnectAPIs } = await import(
  "@/features/integration-messenger/api/connect"
)
const { integrationInstagramConnectAPIs } = await import(
  "@/features/integration-instagram/api/connect"
)
const { integrationWhatsappConnectAPIs } = await import(
  "@/features/integration-whatsapp/api/connect"
)

const stubContext = {
  headers: new Headers({ authorization: "Bearer test-token" }),
}

const connectedOutcome = {
  kind: "outcome" as const,
  outcome: {
    sourceId: "page-1",
    name: "Page One",
    status: "connected" as const,
    coexistEligible: true,
    integrationId: "int-1",
  },
}

/**
 * The picker's parallel transport. Each route is the same contract: the
 * signed-in user authorizes it, the ids are the ONLY thing on the wire (the
 * workspace and the provider token stay server-side, in the pending-auth
 * cookie or the signup session), and every failure comes back as a typed
 * result in the 200 response instead of a status the batch cannot classify.
 */
describe("connect routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectMessengerPage.mockResolvedValue(connectedOutcome)
    mockConnectInstagramAccountViaFacebook.mockResolvedValue(connectedOutcome)
    mockConnectInstagramAccount.mockResolvedValue(connectedOutcome)
  })

  test("the Messenger route passes the signed-in user and the page id, and nothing else", async () => {
    const result = await call(
      integrationMessengerConnectAPIs.connectMessengerPageAPI,
      { pageId: "page-1" },
      { context: stubContext },
    )

    expect(result).toEqual(connectedOutcome)
    expect(mockConnectMessengerPage).toHaveBeenCalledWith({
      userId: "user-1",
      pageId: "page-1",
    })
  })

  test("the Instagram-via-Facebook route passes the signed-in user and the account id", async () => {
    await call(
      integrationInstagramConnectAPIs.connectInstagramFacebookAccountAPI,
      { igId: "ig-1" },
      { context: stubContext },
    )

    expect(mockConnectInstagramAccountViaFacebook).toHaveBeenCalledWith({
      userId: "user-1",
      igId: "ig-1",
    })
  })

  test("the Instagram direct route passes the signed-in user and the account id", async () => {
    await call(
      integrationInstagramConnectAPIs.connectInstagramAccountAPI,
      { igId: "ig-1" },
      { context: stubContext },
    )

    expect(mockConnectInstagramAccount).toHaveBeenCalledWith({
      userId: "user-1",
      igId: "ig-1",
    })
  })

  test("a session-level failure is a normal typed result, not a thrown error", async () => {
    const sessionError = {
      kind: "sessionError" as const,
      code: "sessionExpired" as const,
    }
    mockConnectMessengerPage.mockResolvedValue(sessionError)

    await expect(
      call(
        integrationMessengerConnectAPIs.connectMessengerPageAPI,
        { pageId: "page-1" },
        { context: stubContext },
      ),
    ).resolves.toEqual(sessionError)
  })

  test("a ChatbotXException escaping a core is mapped to its own 4xx, never a 500", async () => {
    mockConnectMessengerPage.mockRejectedValue(
      new ChatbotXException("Nope", "BAD_REQUEST", 400),
    )

    const error = await call(
      integrationMessengerConnectAPIs.connectMessengerPageAPI,
      { pageId: "page-1" },
      { context: stubContext },
    ).catch((thrown: { status?: number }) => thrown)

    expect(error).toBeInstanceOf(Error)
    expect((error as { status?: number }).status).toBe(400)
    expect((error as { status?: number }).status).not.toBe(500)
  })

  test("the WhatsApp route pins manualConnect false and carries only the session id and one number", async () => {
    mockConnectWhatsappNumber.mockResolvedValue({
      type: "connected",
      workspaceId: "ws-1",
      isManual: false,
      redirectUrl: "/space/ws-1",
      outcome: {
        sourceId: "phone-1",
        name: "Phone One",
        status: "connected",
        coexistEligible: true,
        integrationId: "int-1",
      },
    })

    const result = await call(
      integrationWhatsappConnectAPIs.connectWhatsappNumberAPI,
      {
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
        connectExisting: true,
        transferPhoneNumber: false,
        marketingMessageLite: true,
      },
      { context: stubContext },
    )

    expect(result).toMatchObject({ type: "connected", workspaceId: "ws-1" })
    expect(mockConnectWhatsappNumber).toHaveBeenCalledWith({
      userId: "user-1",
      input: {
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
        connectExisting: true,
        transferPhoneNumber: false,
        marketingMessageLite: true,
        manualConnect: false,
      },
    })
  })

  test("the WhatsApp route rejects a body carrying a token, WABA or workspace id", async () => {
    await expect(
      call(
        integrationWhatsappConnectAPIs.connectWhatsappNumberAPI,
        {
          signupSessionId: "session-1",
          phoneNumberId: "phone-1",
          connectExisting: true,
          transferPhoneNumber: false,
          marketingMessageLite: true,
          accessToken: "leaked",
          workspaceId: "ws-other",
        } as never,
        { context: stubContext },
      ),
    ).resolves.toBeDefined()

    // Anything beyond the five session fields is dropped by the input schema
    // — it can never reach the core.
    expect(
      mockConnectWhatsappNumber.mock.calls[0]?.[0]?.input,
    ).not.toHaveProperty("accessToken")
    expect(
      mockConnectWhatsappNumber.mock.calls[0]?.[0]?.input,
    ).not.toHaveProperty("workspaceId")
  })

  test("an impossible selection-flow result from the core becomes a typed item failure", async () => {
    mockConnectWhatsappNumber.mockResolvedValue({
      type: "phoneNumberSelection",
      signupSessionId: "session-1",
      phoneNumbers: [],
    })

    const result = await call(
      integrationWhatsappConnectAPIs.connectWhatsappNumberAPI,
      {
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
        connectExisting: true,
        transferPhoneNumber: false,
        marketingMessageLite: true,
      },
      { context: stubContext },
    )

    expect(result).toEqual({
      kind: "outcome",
      outcome: {
        sourceId: "phone-1",
        name: "phone-1",
        status: "failed",
        reason: "unknown",
        coexistEligible: false,
      },
    })
  })

  test("the acting user is on the audit context inside the core call", async () => {
    // The connect audits (`auditChannelConnected`, the workspace-create
    // audit) are written from inside the core. These routes authorize on the
    // user alone — there is no workspace middleware to stamp the actor — so
    // without the shared middleware they would record no actor at all.
    let actorInsideCore: ReturnType<typeof getAuditActor>
    mockConnectMessengerPage.mockImplementation(() => {
      actorInsideCore = getAuditActor()
      return Promise.resolve(connectedOutcome)
    })

    await call(
      integrationMessengerConnectAPIs.connectMessengerPageAPI,
      { pageId: "page-1" },
      {
        context: {
          headers: new Headers({
            authorization: "Bearer test-token",
            "user-agent": "vitest-agent",
          }),
        },
      },
    )

    expect(actorInsideCore).toMatchObject({
      userId: "user-1",
      userAgent: "vitest-agent",
    })
  })

  test("every connect route stamps the actor, not just Messenger", async () => {
    const actors: (string | undefined)[] = []
    const capture = () => {
      actors.push(getAuditActor()?.userId as string | undefined)
      return Promise.resolve(connectedOutcome)
    }
    mockConnectInstagramAccountViaFacebook.mockImplementation(capture)
    mockConnectInstagramAccount.mockImplementation(capture)
    mockConnectWhatsappNumber.mockImplementation(capture)

    await call(
      integrationInstagramConnectAPIs.connectInstagramFacebookAccountAPI,
      { igId: "ig-1" },
      { context: stubContext },
    )
    await call(
      integrationInstagramConnectAPIs.connectInstagramAccountAPI,
      { igId: "ig-1" },
      { context: stubContext },
    )
    await call(
      integrationWhatsappConnectAPIs.connectWhatsappNumberAPI,
      {
        signupSessionId: "session-1",
        phoneNumberId: "phone-1",
        connectExisting: true,
        transferPhoneNumber: false,
        marketingMessageLite: true,
      },
      { context: stubContext },
    )

    expect(actors).toEqual(["user-1", "user-1", "user-1"])
  })
})
