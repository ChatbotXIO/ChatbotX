// @vitest-environment node

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
  createIdMock,
  dbTransactionMock,
  exchangeAccessTokenMock,
  findConnectedPhoneNumberIdsMock,
  findWabaMock,
  getCoexistEligibilityMock,
  getSharedWabaIdMock,
  inboxExistsByWorkspaceIdAndNameMock,
  invalidateCacheByTagsMock,
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
  createIdMock: vi.fn(),
  dbTransactionMock: vi.fn(),
  exchangeAccessTokenMock: vi.fn(),
  findConnectedPhoneNumberIdsMock: vi.fn(),
  findWabaMock: vi.fn(),
  getCoexistEligibilityMock: vi.fn(),
  getSharedWabaIdMock: vi.fn(),
  inboxExistsByWorkspaceIdAndNameMock: vi.fn(),
  invalidateCacheByTagsMock: vi.fn(),
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
  inboxService: {
    existsByWorkspaceIdAndName: inboxExistsByWorkspaceIdAndNameMock,
  },
  integrationWhatsappService: {
    createSignupSession: createSignupSessionMock,
    consumeSignupSession: consumeSignupSessionMock,
    findConnectedPhoneNumberIds: findConnectedPhoneNumberIdsMock,
    recordRegistrationOutcome: recordRegistrationOutcomeMock,
  },
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
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationWhatsappModel: {
    inboxId: "inboxId",
    id: "id",
  },
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

vi.mock("@chatbotx.io/utils", () => ({
  createId: createIdMock,
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
    consumeSignupSessionMock.mockResolvedValue({
      accessToken: "access-token-1",
      apiVersion: "v23.0",
      businessId: "business-1",
      wabaId: "waba-1",
    })
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
    inboxExistsByWorkspaceIdAndNameMock.mockResolvedValue(false)
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
})
