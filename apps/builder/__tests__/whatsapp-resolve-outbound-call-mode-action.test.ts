// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
  ctx: { user: { id: string } }
}) => Promise<unknown>

const {
  findByMock,
  findInboxMock,
  findByInboxIdForWorkspaceMock,
  resolveStatusMock,
  findWorkspaceByIdMock,
  getCallingSettingsMock,
  getWhatsappCallingPreflightMock,
  withCacheMock,
  canCallConversationMock,
} = vi.hoisted(() => ({
  findByMock: vi.fn(),
  findInboxMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  resolveStatusMock: vi.fn(),
  findWorkspaceByIdMock: vi.fn(),
  getCallingSettingsMock: vi.fn(),
  getWhatsappCallingPreflightMock: vi.fn(),
  // Pass through to the wrapped fetcher by default — individual tests
  // override this to assert cache-hit/short-circuit behavior.
  withCacheMock: vi.fn(
    async (_key: string, fn: () => Promise<unknown>) => await fn(),
  ),
  canCallConversationMock: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { callingActionClient: chain }
})

vi.mock(
  "@/features/integration-whatsapp/calling/get-whatsapp-calling-preflight",
  () => ({
    getWhatsappCallingPreflight: getWhatsappCallingPreflightMock,
  }),
)

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  getCallingSettings: getCallingSettingsMock,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: withCacheMock,
}))

vi.mock("@chatbotx.io/business", () => ({
  canCallConversation: canCallConversationMock,
  conversationService: { findBy: findByMock },
  contactInboxService: { findBy: findInboxMock },
  whatsappCallPermissionService: { resolveStatus: resolveStatusMock },
  workspaceService: { findById: findWorkspaceByIdMock },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number
    constructor(message: string, code = "systemError", httpStatusCode = 400) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: findByInboxIdForWorkspaceMock,
  },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { resolveOutboundCallModeAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/resolve-outbound-call-mode.action"
)
const action = resolveOutboundCallModeAction as unknown as ActionHandler

const ctx = { user: { id: "agent-1" } }

const call = (conversationId = "conversation-1", contactInboxId?: string) =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: contactInboxId
      ? { conversationId, contactInboxId }
      : { conversationId },
    ctx,
  })

describe("resolveOutboundCallModeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withCacheMock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => await fn(),
    )
    canCallConversationMock.mockResolvedValue(true)
    findByMock.mockResolvedValue({
      id: "conversation-1",
      contactId: "contact-1",
      inboxId: "inbox-1",
    })
    findInboxMock.mockResolvedValue({
      id: "contact-inbox-1",
      inboxId: "inbox-1",
      channel: "whatsapp",
      sourceId: "+15551234567",
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      displayPhoneNumber: "+44 20 7946 0958",
      auth: {
        clientSecret: "app-secret",
        metadata: { isManual: false },
      },
    })
    resolveStatusMock.mockResolvedValue(undefined)
    findWorkspaceByIdMock.mockResolvedValue({ id: "workspace-1" })
    getCallingSettingsMock.mockResolvedValue({ status: "ENABLED" })
    getWhatsappCallingPreflightMock.mockResolvedValue({
      isManual: false,
      hasAppCredential: true,
      callsSubscribed: true,
      platformType: "CLOUD_API",
      isCloudApiPlatform: true,
      messagingLimitTier: "TIER_10K",
      messagingLimitSufficient: true,
    })
  })

  test("returns manualCallsSubscriptionUnverified:false for a platform-credential integration", async () => {
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
    })
  })

  test("returns manualCallsSubscriptionUnverified:true for a manual integration WITH an app secret", async () => {
    getWhatsappCallingPreflightMock.mockResolvedValue({
      isManual: true,
      hasAppCredential: false,
      callsSubscribed: null,
      platformType: null,
      isCloudApiPlatform: null,
      messagingLimitTier: null,
      messagingLimitSufficient: true,
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      displayPhoneNumber: "+44 20 7946 0958",
      auth: { clientSecret: "an-app-secret", metadata: { isManual: true } },
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: true,
      integrationId: "integration-1",
    })
  })

  test("returns manualCallsSubscriptionUnverified:true for a manual integration WITHOUT an app secret", async () => {
    getWhatsappCallingPreflightMock.mockResolvedValue({
      isManual: true,
      hasAppCredential: false,
      callsSubscribed: null,
      platformType: null,
      isCloudApiPlatform: null,
      messagingLimitTier: null,
      messagingLimitSufficient: true,
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      displayPhoneNumber: "+44 20 7946 0958",
      auth: { clientSecret: "", metadata: { isManual: true } },
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: true,
      manualCallsSubscriptionUnverified: true,
      integrationId: "integration-1",
    })
  })

  test("throws when the conversation cannot be found", async () => {
    findByMock.mockResolvedValue(undefined)
    await expect(call()).rejects.toThrow("whatsapp.calls.errors.callNotFound")
  })

  // Review B1: this used to THROW (via `assertCallAccessOrThrow`), which left
  // the client's `isResolvingMode` stuck `true` forever (`outboundCallMode`
  // never resolves to a value on a query error) — a permanently disabled
  // call button with no feedback. Returning `{ mode: "none", reason:
  // "callAccessDenied" }` instead lets the shared starter's `mode: "none"`
  // alert path handle it the same as every other denial reason.
  test("P2 item 5 (D3) / M1: resolves mode:none/callAccessDenied for an assigned-only agent for a conversation assigned to someone else", async () => {
    canCallConversationMock.mockResolvedValue(false)

    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "callAccessDenied",
    })

    expect(canCallConversationMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      userId: "agent-1",
    })
    expect(findInboxMock).not.toHaveBeenCalled()
  })

  test("returns none/notWhatsappConversation when there is no WhatsApp contact inbox", async () => {
    findInboxMock.mockResolvedValue(undefined)
    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "notWhatsappConversation",
    })
  })

  test("returns none/callingNotEnabled when calling.status is not ENABLED", async () => {
    getCallingSettingsMock.mockResolvedValue({ status: "DISABLED" })
    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "callingNotEnabled",
    })
  })

  test("returns none/tokenInvalid when the calling-settings GET throws", async () => {
    getCallingSettingsMock.mockRejectedValue(new Error("401 invalid token"))
    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "tokenInvalid",
    })
  })

  test("returns voip + unsignedWebhookWarning for a manually-connected number with no app secret (R4 §6.4)", async () => {
    getWhatsappCallingPreflightMock.mockResolvedValue({
      isManual: true,
      hasAppCredential: false,
      callsSubscribed: null,
      platformType: null,
      isCloudApiPlatform: null,
      messagingLimitTier: null,
      messagingLimitSufficient: true,
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      displayPhoneNumber: "+44 20 7946 0958",
      auth: { clientSecret: "", metadata: { isManual: true } },
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: true,
      manualCallsSubscriptionUnverified: true,
      integrationId: "integration-1",
    })
  })

  test("does not warn for a manually-connected number that has an app secret configured", async () => {
    getWhatsappCallingPreflightMock.mockResolvedValue({
      isManual: true,
      hasAppCredential: false,
      callsSubscribed: null,
      platformType: null,
      isCloudApiPlatform: null,
      messagingLimitTier: null,
      messagingLimitSufficient: true,
    })
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      displayPhoneNumber: "+44 20 7946 0958",
      auth: { clientSecret: "an-app-secret", metadata: { isManual: true } },
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: true,
      integrationId: "integration-1",
    })
  })

  test("returns none/webhookNotSubscribed when the app has no calls webhook field", async () => {
    getWhatsappCallingPreflightMock.mockResolvedValue({
      isManual: false,
      hasAppCredential: true,
      callsSubscribed: false,
      platformType: "CLOUD_API",
      isCloudApiPlatform: true,
      messagingLimitTier: "TIER_10K",
      messagingLimitSufficient: true,
    })
    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "webhookNotSubscribed",
    })
  })

  test("returns none/ineligibleNumber for a blocked business country (NG)", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      displayPhoneNumber: "+234 810 123 4567",
      auth: { clientSecret: "app-secret", metadata: { isManual: false } },
    })
    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "ineligibleNumber",
    })
  })

  // TR was removed from BLOCKED_OUTBOUND_COUNTRIES —
  // it is not in Meta's documented business-initiated-calling block list.
  test("returns voip for a TR business number (not in the blocked-country list)", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      displayPhoneNumber: "+90 532 123 4567",
      auth: { clientSecret: "app-secret", metadata: { isManual: false } },
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
    })
  })

  test("returns voip with permissionStatus undefined when no permission row exists", async () => {
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
    })
  })

  test.each([
    "no_permission",
    "temporary",
    "permanent",
  ] as const)("returns voip with the %s permission status the service resolves", async (permissionStatus) => {
    resolveStatusMock.mockResolvedValue(permissionStatus)
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
    })
  })

  test("never calls Meta's rate-limited call_permissions GET", async () => {
    await call()
    // Permission comes from the local record only.
    expect(resolveStatusMock).toHaveBeenCalledWith("contact-inbox-1")
  })

  test("caches the calling-settings GET per integration with a TTL", async () => {
    await call()

    expect(withCacheMock).toHaveBeenCalledWith(
      "whatsapp-outbound-call-mode:calling-settings:integration-1",
      expect.any(Function),
      expect.objectContaining({ ttl: 5 * 60 }),
    )
    expect(getCallingSettingsMock).toHaveBeenCalledTimes(1)
  })

  test("P4 item 2: contactInboxId is looked up scoped to the conversation's own contact (ownership reused from resolveContactInbox)", async () => {
    await call("conversation-1", "contact-inbox-2")

    expect(findInboxMock).toHaveBeenCalledWith({
      where: {
        id: "contact-inbox-2",
        contactId: "contact-1",
        channel: "whatsapp",
      },
    })
  })

  test("P4 item 2: rejects (mode:none) a contactInboxId that does not belong to this conversation's contact", async () => {
    // The ownership-scoped where-clause simply finds nothing for a foreign id.
    findInboxMock.mockResolvedValue(undefined)

    await expect(
      call("conversation-1", "someone-elses-contact-inbox"),
    ).resolves.toEqual({ mode: "none", reason: "notWhatsappConversation" })
  })

  test("P4 item 2: mode is identical whether or not contactInboxId is supplied, when it does resolve", async () => {
    const withoutId = await call("conversation-1")
    const withId = await call("conversation-1", "contact-inbox-1")

    expect(withId).toEqual(withoutId)
  })

  test("a cache hit skips the live Meta GET entirely", async () => {
    withCacheMock.mockResolvedValue({ status: "ENABLED" })

    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
    })
    expect(getCallingSettingsMock).not.toHaveBeenCalled()
  })
})
