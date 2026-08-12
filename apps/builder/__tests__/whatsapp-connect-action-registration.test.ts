// @vitest-environment node

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  ctx: { user: { id: string } }
  parsedInput: {
    businessId?: string | null
    wabaId?: string | null
    connectExisting: boolean
    transferPhoneNumber: boolean
    manualConnect: boolean
    marketingMessageLite: boolean
    phoneNumberId?: string | null
    workspaceId?: string | null
    signupSessionId?: string | null
    accessToken?: string | null
    code?: string | null
  }
}) => Promise<unknown>

const {
  addSystemUserMock,
  buildContextMock,
  connectChannelIntegrationMock,
  createSignupSessionMock,
  consumeSignupSessionMock,
  findActiveSignupSessionMock,
  createIdMock,
  dbTransactionMock,
  exchangeAccessTokenMock,
  findConnectedPhoneNumberIdsMock,
  findWabaMock,
  getCoexistEligibilityMock,
  getSharedWabaIdMock,
  invalidateCacheByTagsMock,
  isUniqueViolationErrorMock,
  listPhoneNumbersMock,
  platformCredentialResolveMock,
  recordRegistrationOutcomeMock,
  registerPhoneNumberMock,
  shareCreditLineMock,
  subscribeWebhookMock,
  updateWorkspaceLogoMock,
  workspaceFindMock,
} = vi.hoisted(() => ({
  addSystemUserMock: vi.fn(),
  buildContextMock: vi.fn(),
  connectChannelIntegrationMock: vi.fn(),
  createSignupSessionMock: vi.fn(),
  consumeSignupSessionMock: vi.fn(),
  findActiveSignupSessionMock: vi.fn(),
  createIdMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  exchangeAccessTokenMock: vi.fn(),
  findConnectedPhoneNumberIdsMock: vi.fn(),
  findWabaMock: vi.fn(),
  getCoexistEligibilityMock: vi.fn(),
  getSharedWabaIdMock: vi.fn(),
  invalidateCacheByTagsMock: vi.fn(),
  isUniqueViolationErrorMock: vi.fn(),
  listPhoneNumbersMock: vi.fn(),
  platformCredentialResolveMock: vi.fn(),
  recordRegistrationOutcomeMock: vi.fn(),
  registerPhoneNumberMock: vi.fn(),
  shareCreditLineMock: vi.fn(),
  subscribeWebhookMock: vi.fn(),
  updateWorkspaceLogoMock: vi.fn(),
  workspaceFindMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.inputSchema = () => chain
  chain.action = (handler: ActionHandler) => handler
  return { authActionClient: chain }
})

vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (path: string) => `https://broker.example.com${path}`,
  getBrokerOrigin: () => "https://broker.example.com",
}))

vi.mock("@/features/workspaces/actions/upload-logo", () => ({
  updateWorkspaceLogo: updateWorkspaceLogoMock,
}))

vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: buildContextMock,
  connectChannelIntegration: connectChannelIntegrationMock,
  integrationWhatsappService: {
    createSignupSession: createSignupSessionMock,
    consumeSignupSession: consumeSignupSessionMock,
    findActiveSignupSession: findActiveSignupSessionMock,
    findConnectedPhoneNumberIds: findConnectedPhoneNumberIdsMock,
    recordRegistrationOutcome: recordRegistrationOutcomeMock,
    // Post-connect CAPI scope cache refresh (Phase 2 CTWA); connect flow
    // treats its result as best-effort, so a resolved null is sufficient.
    refreshCapiScopeCache: vi.fn().mockResolvedValue(null),
  },
  WHATSAPP_CAPI_SCOPE: "whatsapp_business_manage_events",
  platformCredentialService: {
    resolveForOwner: platformCredentialResolveMock,
  },
  workspaceService: {
    find: workspaceFindMock,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: dbTransactionMock,
  },
  eq: (left: unknown, right: unknown) => ({ left, right }),
  isUniqueViolationError: isUniqueViolationErrorMock,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationWhatsappModel: {
    inboxId: "inboxId",
    id: "id",
  },
  WHATSAPP_PHONE_NUMBER_UNIQUE_CONSTRAINT:
    "IntegrationWhatsapp_phoneNumberId_key",
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  addSystemUser: addSystemUserMock,
  integration: { name: "whatsapp" },
  registerPhoneNumber: registerPhoneNumberMock,
  shareCreditLine: shareCreditLineMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/auth", () => ({
  debugToken: vi.fn(),
  exchangeAccessToken: exchangeAccessTokenMock,
  getSharedWabaId: getSharedWabaIdMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/phone-number", () => ({
  getCoexistEligibility: getCoexistEligibilityMock,
  listPhoneNumbers: listPhoneNumbersMock,
  normalizeWhatsappDisplayPhoneNumber: (phone: string) =>
    phone.replace(/\D/g, ""),
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/waba", () => ({
  findWaba: findWabaMock,
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/webhook", () => ({
  subscribeWebhook: subscribeWebhookMock,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: invalidateCacheByTagsMock,
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: createIdMock }
})

// Vitest resolves `next-intl/server` to next-intl's react-client build, whose
// `getTranslations` throws outright. The connect action reads from the root
// namespace, so the keys are looked up verbatim.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn((namespace?: string) => {
    const messages: Record<string, string> = {
      "channels.duplicated.whatsapp":
        "This WhatsApp number is already connected to another workspace.",
      "whatsapp.connect.errors.accessTokenRequired":
        "WhatsApp access token is required.",
      "whatsapp.connect.errors.appSettingsNotFound":
        "WhatsApp app settings were not found.",
      "whatsapp.connect.errors.failedToPersistIntegration":
        "Failed to save the WhatsApp integration.",
      "whatsapp.connect.errors.noPhoneNumberFound":
        "No WhatsApp phone number was found.",
      "whatsapp.connect.errors.noPhoneNumbersFound":
        "No phone numbers were found for this WhatsApp Business Account.",
      "whatsapp.connect.errors.phoneNumberNotFound":
        "Selected WhatsApp phone number was not found.",
      "whatsapp.connect.errors.unableToVerifyToken":
        "Unable to verify the WhatsApp token.",
      "whatsapp.connect.errors.wabaMismatch":
        "Selected WhatsApp Business Account does not match the authorization.",
      "whatsapp.connect.errors.wabaResolveFailed":
        "Could not resolve the WhatsApp Business Account from the authorization.",
      "whatsapp.signupSessionExpired":
        "Your WhatsApp signup session has expired. Please start the connection again.",
    }

    return Promise.resolve(
      (key: string) => messages[namespace ? `${namespace}.${key}` : key] ?? key,
    )
  }),
}))

const { connectWhatsappAction } = await import(
  "@/features/integration-whatsapp/actions/connect.action"
)

const callConnectWhatsappAction =
  connectWhatsappAction as unknown as ActionHandler

const selectedPhoneNumber = {
  id: "phone-1",
  verified_name: "Verified Phone",
  code_verification_status: "VERIFIED",
  display_phone_number: "+84 34 872 1855",
  quality_rating: "GREEN",
  platform_type: "CLOUD_API",
  throughput: { level: "STANDARD" },
  webhook_configuration: {},
}

const connectedPhoneNumber = {
  ...selectedPhoneNumber,
  id: "phone-connected",
  verified_name: "Connected Phone",
  display_phone_number: "+84 90 000 0000",
}

const integrationRow = {
  id: "integration-1",
  workspaceId: "ws-1",
  inboxId: "inbox-1",
  auth: {},
  phoneNumberId: selectedPhoneNumber.id,
  wabaId: "waba-1",
  businessId: "business-1",
  name: selectedPhoneNumber.verified_name,
  displayPhoneNumber: "84348721855",
  isCoexist: true,
  platformType: "CLOUD_API",
}

describe("connectWhatsappAction registration", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // The happy paths below never collide on the phone number; the tests that
    // exercise the constraint opt in explicitly.
    isUniqueViolationErrorMock.mockReturnValue(false)

    createIdMock
      .mockReturnValueOnce("integration-1")
      .mockReturnValueOnce("inbox-source-id")

    workspaceFindMock.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
    platformCredentialResolveMock.mockResolvedValue({
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        configId: "config-1",
        systemUserId: "system-user-1",
        systemUserToken: "system-token-1",
        businessName: "Business",
        verifyToken: "verify-token",
        version: "v23.0",
        businessId: "",
      },
    })
    // The session is read up front and only spent inside the write transaction,
    // so the two halves return different shapes: the payload, then whether the
    // claim was still unspent.
    findActiveSignupSessionMock.mockResolvedValue({
      accessToken: "access-token-1",
      apiVersion: "v23.0",
      businessId: "business-1",
      wabaId: "waba-1",
    })
    consumeSignupSessionMock.mockResolvedValue(true)
    exchangeAccessTokenMock.mockResolvedValue({
      access_token: "access-token-1",
    })
    getSharedWabaIdMock.mockResolvedValue("waba-1")
    findWabaMock.mockResolvedValue({
      id: "waba-1",
      owner_business_info: { id: "business-1" },
    })
    createSignupSessionMock.mockResolvedValue({ id: "signup-session-next" })
    listPhoneNumbersMock.mockResolvedValue({
      data: [selectedPhoneNumber],
      paging: { cursors: { before: "", after: "" } },
    })
    findConnectedPhoneNumberIdsMock.mockResolvedValue(new Set<string>())
    getCoexistEligibilityMock.mockResolvedValue({
      isOnBizApp: true,
      platformType: "CLOUD_API",
    })
    registerPhoneNumberMock.mockResolvedValue({ status: "registered" })
    recordRegistrationOutcomeMock.mockResolvedValue(undefined)
    addSystemUserMock.mockResolvedValue(undefined)
    shareCreditLineMock.mockResolvedValue(undefined)
    buildContextMock.mockResolvedValue({})
    updateWorkspaceLogoMock.mockResolvedValue(undefined)
    subscribeWebhookMock.mockResolvedValue(undefined)
    invalidateCacheByTagsMock.mockResolvedValue(undefined)
    connectChannelIntegrationMock.mockImplementation(
      async (props: {
        insertIntegration: (inboxId: string) => Promise<void>
      }) => {
        await props.insertIntegration("inbox-1")
      },
    )

    const insertBuilder = {
      values: vi.fn(),
      onConflictDoUpdate: vi.fn(),
      returning: vi.fn().mockResolvedValue([integrationRow]),
    }
    insertBuilder.values.mockReturnValue(insertBuilder)
    insertBuilder.onConflictDoUpdate.mockReturnValue(insertBuilder)

    dbTransactionMock.mockImplementation(
      async (
        callback: (tx: { insert: () => typeof insertBuilder }) => unknown,
      ) => await callback({ insert: () => insertBuilder }),
    )
  })

  test("does not register the selected phone number when the selected phone is eligible for coexist", async () => {
    await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        businessId: null,
        wabaId: null,
        connectExisting: true,
        transferPhoneNumber: false,
        manualConnect: false,
        marketingMessageLite: true,
        phoneNumberId: selectedPhoneNumber.id,
        workspaceId: "ws-1",
        signupSessionId: "signup-session-1",
        accessToken: null,
        code: null,
      },
    })

    expect(getCoexistEligibilityMock).toHaveBeenCalledWith({
      phoneNumberId: selectedPhoneNumber.id,
      accessToken: "access-token-1",
      version: "v23.0",
    })
    expect(registerPhoneNumberMock).not.toHaveBeenCalled()
    expect(recordRegistrationOutcomeMock).not.toHaveBeenCalled()
  })

  test("shows the remaining available phone for selection when the WABA has multiple phones and one is already connected", async () => {
    listPhoneNumbersMock.mockResolvedValue({
      data: [connectedPhoneNumber, selectedPhoneNumber],
      paging: { cursors: { before: "", after: "" } },
    })
    findConnectedPhoneNumberIdsMock.mockResolvedValue(
      new Set<string>([connectedPhoneNumber.id]),
    )

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        businessId: null,
        wabaId: null,
        connectExisting: false,
        transferPhoneNumber: false,
        manualConnect: false,
        marketingMessageLite: true,
        phoneNumberId: null,
        workspaceId: "ws-1",
        signupSessionId: null,
        accessToken: null,
        code: "oauth-code-1",
      },
    })

    expect(result).toEqual({
      type: "phoneNumberSelection",
      signupSessionId: "signup-session-next",
      phoneNumbers: [
        {
          id: selectedPhoneNumber.id,
          label: selectedPhoneNumber.verified_name,
          displayPhoneNumber: selectedPhoneNumber.display_phone_number,
        },
      ],
    })
    expect(createSignupSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        candidatePhoneNumberIds: [selectedPhoneNumber.id],
      }),
    )
    expect(registerPhoneNumberMock).not.toHaveBeenCalled()
  })

  test("returns phone verification result when registration requires OTP", async () => {
    const registrationError = {
      code: 100,
      subCode: 2_593_005,
      message: "Invalid parameter",
      type: "OAuthException",
      userTitle: "Phone number is not verified",
      userMessage: "Phone number is not verified through SMS or voice.",
      fbtraceId: "trace-1",
      at: "2026-07-27T08:00:00.000Z",
    }
    registerPhoneNumberMock.mockResolvedValueOnce({
      status: "verification_required",
      error: new Error("Phone number is not verified"),
    })
    recordRegistrationOutcomeMock.mockResolvedValueOnce(registrationError)

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        businessId: null,
        wabaId: null,
        connectExisting: false,
        transferPhoneNumber: false,
        manualConnect: false,
        marketingMessageLite: true,
        phoneNumberId: null,
        workspaceId: "ws-1",
        signupSessionId: null,
        accessToken: null,
        code: "oauth-code-1",
      },
    })

    expect(registerPhoneNumberMock).toHaveBeenCalledWith({
      auth: expect.anything(),
      phoneNumberId: selectedPhoneNumber.id,
    })
    expect(recordRegistrationOutcomeMock).toHaveBeenCalledWith({
      id: integrationRow.id,
      workspaceId: "ws-1",
      outcome: {
        status: "pending_verification",
        error: expect.any(Error),
      },
    })
    expect(result).toEqual({
      type: "phoneNumberVerificationRequired",
      redirectUrl: "/space/ws-1",
      integrationId: integrationRow.id,
      workspaceId: "ws-1",
      displayPhoneNumber: selectedPhoneNumber.display_phone_number,
      verifiedName: selectedPhoneNumber.verified_name,
      registrationError,
    })
  })

  test("still shows the verification screen when Meta asks for a code without an error payload", async () => {
    registerPhoneNumberMock.mockResolvedValueOnce({
      status: "verification_required",
      error: new Error("Phone number is not verified"),
    })
    // Meta usually attaches an explanatory error, but not always. Gating the
    // screen on the error too would strand the operator away from the only page
    // that can finish the connect.
    recordRegistrationOutcomeMock.mockResolvedValueOnce(null)

    const result = await callConnectWhatsappAction({
      ctx: { user: { id: "user-1" } },
      parsedInput: {
        businessId: null,
        wabaId: null,
        connectExisting: false,
        transferPhoneNumber: false,
        manualConnect: false,
        marketingMessageLite: true,
        phoneNumberId: null,
        workspaceId: "ws-1",
        signupSessionId: null,
        accessToken: null,
        code: "oauth-code-1",
      },
    })

    expect(result).toEqual({
      type: "phoneNumberVerificationRequired",
      redirectUrl: "/space/ws-1",
      integrationId: integrationRow.id,
      workspaceId: "ws-1",
      displayPhoneNumber: selectedPhoneNumber.display_phone_number,
      verifiedName: selectedPhoneNumber.verified_name,
      registrationError: null,
    })
  })

  test("reports an expired signup session without spending the Meta token", async () => {
    findActiveSignupSessionMock.mockResolvedValueOnce(null)

    await expect(
      callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          businessId: null,
          wabaId: null,
          connectExisting: true,
          transferPhoneNumber: false,
          manualConnect: false,
          marketingMessageLite: true,
          phoneNumberId: selectedPhoneNumber.id,
          workspaceId: "ws-1",
          signupSessionId: "signup-session-1",
          accessToken: null,
          code: null,
        },
      }),
    ).rejects.toThrow(
      "Your WhatsApp signup session has expired. Please start the connection again.",
    )
    expect(consumeSignupSessionMock).not.toHaveBeenCalled()
    expect(dbTransactionMock).not.toHaveBeenCalled()
  })

  test("aborts the connect when the session was already spent by a concurrent request", async () => {
    consumeSignupSessionMock.mockResolvedValueOnce(false)

    await expect(
      callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          businessId: null,
          wabaId: null,
          connectExisting: true,
          transferPhoneNumber: false,
          manualConnect: false,
          marketingMessageLite: true,
          phoneNumberId: selectedPhoneNumber.id,
          workspaceId: "ws-1",
          signupSessionId: "signup-session-1",
          accessToken: null,
          code: null,
        },
      }),
    ).rejects.toThrow(
      "Your WhatsApp signup session has expired. Please start the connection again.",
    )
  })

  test("maps the phone number unique violation to the already-connected message", async () => {
    // The pre-flight check can pass and still lose the race, so the constraint
    // is the real gate; its violation has to read like the pre-flight rejection
    // rather than a raw Postgres error.
    isUniqueViolationErrorMock.mockReturnValue(true)
    dbTransactionMock.mockRejectedValueOnce(
      new Error("duplicate key value violates unique constraint"),
    )

    await expect(
      callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          businessId: null,
          wabaId: null,
          connectExisting: true,
          transferPhoneNumber: false,
          manualConnect: false,
          marketingMessageLite: true,
          phoneNumberId: selectedPhoneNumber.id,
          workspaceId: "ws-1",
          signupSessionId: "signup-session-1",
          accessToken: null,
          code: null,
        },
      }),
    ).rejects.toThrow(
      "This WhatsApp number is already connected to another workspace.",
    )
  })

  test("rejects a phone number the pre-flight check already sees connected", async () => {
    findConnectedPhoneNumberIdsMock.mockResolvedValue(
      new Set<string>([selectedPhoneNumber.id]),
    )

    await expect(
      callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          businessId: null,
          wabaId: null,
          connectExisting: true,
          transferPhoneNumber: false,
          manualConnect: false,
          marketingMessageLite: true,
          phoneNumberId: selectedPhoneNumber.id,
          workspaceId: "ws-1",
          signupSessionId: "signup-session-1",
          accessToken: null,
          code: null,
        },
      }),
    ).rejects.toThrow(
      "This WhatsApp number is already connected to another workspace.",
    )
    expect(dbTransactionMock).not.toHaveBeenCalled()
  })

  test("surfaces the real quota error instead of the generic token-verification message", async () => {
    // Regression guard: a typed ChatbotXException raised deep inside
    // connectChannelIntegration (e.g. InboxService.create hitting the
    // owner's channel quota) must reach the caller verbatim rather than
    // being swallowed by the outer catch-all's "unable to verify token"
    // fallback.
    const quotaError = new ChatbotXException(
      "Channel limit reached for this plan",
    )
    Object.assign(quotaError, { code: "channelLimitReached" })
    connectChannelIntegrationMock.mockRejectedValueOnce(quotaError)

    await expect(
      callConnectWhatsappAction({
        ctx: { user: { id: "user-1" } },
        parsedInput: {
          businessId: null,
          wabaId: null,
          connectExisting: true,
          transferPhoneNumber: false,
          manualConnect: false,
          marketingMessageLite: true,
          phoneNumberId: selectedPhoneNumber.id,
          workspaceId: "ws-1",
          signupSessionId: "signup-session-1",
          accessToken: null,
          code: null,
        },
      }),
    ).rejects.toThrow("Channel limit reached for this plan")
  })
})
