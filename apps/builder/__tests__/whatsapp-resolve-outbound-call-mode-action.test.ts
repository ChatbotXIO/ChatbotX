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
  mirrorProviderGrantMock,
  findWorkspaceByIdMock,
  getCallingSettingsMock,
  getCallPermissionsMock,
  getWhatsappCallingPreflightMock,
  withCacheMock,
  canCallConversationMock,
} = vi.hoisted(() => ({
  findByMock: vi.fn(),
  findInboxMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  resolveStatusMock: vi.fn(),
  mirrorProviderGrantMock: vi.fn(),
  findWorkspaceByIdMock: vi.fn(),
  getCallingSettingsMock: vi.fn(),
  getCallPermissionsMock: vi.fn(),
  getWhatsappCallingPreflightMock: vi.fn(),
  // Pass through to the wrapped fetcher by default — individual tests
  // override this to assert cache-hit/short-circuit behavior.
  withCacheMock: vi.fn(
    async (_key: string, fn: () => Promise<unknown>) => await fn(),
  ),
  canCallConversationMock: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
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
  getCallPermissions: getCallPermissionsMock,
  // Real implementation — the gate is only as good as the key it reads.
  canPerformCallAction: (
    response: {
      actions?: { action_name: string; can_perform_action?: boolean }[]
    },
    actionName: string,
  ) =>
    response.actions?.find((candidate) => candidate.action_name === actionName)
      ?.can_perform_action === true,
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: withCacheMock,
}))

vi.mock("@chatbotx.io/business", () => ({
  callPermissionStatuses: {
    permanent: "permanent",
    temporary: "temporary",
    noPermission: "no_permission",
  },
  canCallConversation: canCallConversationMock,
  conversationService: { findBy: findByMock },
  contactInboxService: { findBy: findInboxMock },
  whatsappCallPermissionService: {
    resolveStatus: resolveStatusMock,
    mirrorProviderGrant: mirrorProviderGrantMock,
  },
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
    mirrorProviderGrantMock.mockResolvedValue(true)
    getCallPermissionsMock.mockResolvedValue({
      permission: { status: "no_permission" },
      actions: [],
    })
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
      permissionStatus: "no_permission",
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
      permissionStatus: "no_permission",
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
      permissionStatus: "no_permission",
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
      permissionStatus: "no_permission",
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
      permissionStatus: "no_permission",
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
      permissionStatus: "no_permission",
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
    })
  })

  test("mirror empty and Meta unreachable: permissionStatus stays undefined rather than being invented", async () => {
    getCallPermissionsMock.mockRejectedValue(new Error("meta down"))
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
    })
  })

  test("legacy: returns voip with permissionStatus undefined when no permission row exists", async () => {
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: "no_permission",
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

  test("a mirror hit answers on its own — Meta is never asked", async () => {
    resolveStatusMock.mockResolvedValue("permanent")

    await expect(call()).resolves.toMatchObject({
      permissionStatus: "permanent",
    })

    expect(resolveStatusMock).toHaveBeenCalledWith("contact-inbox-1")
    expect(getCallPermissionsMock).not.toHaveBeenCalled()
  })

  test("an empty mirror falls through to Meta, cached per contact inbox", async () => {
    getCallPermissionsMock.mockResolvedValue({
      permission: { status: "temporary" },
      actions: [],
    })

    await expect(call()).resolves.toMatchObject({
      permissionStatus: "temporary",
    })

    expect(getCallPermissionsMock).toHaveBeenCalledWith(expect.anything(), {
      userWaId: "15551234567",
    })
    expect(withCacheMock).toHaveBeenCalledWith(
      "whatsapp-call-permissions:integration-1:contact-inbox-1",
      expect.any(Function),
      expect.objectContaining({ ttl: 60 }),
    )
  })

  test("a grant Meta reported is mirrored locally so the next open costs no round trip", async () => {
    getCallPermissionsMock.mockResolvedValue({
      permission: { status: "temporary", expiration_time: "1790000000" },
      actions: [],
    })

    await call()

    expect(mirrorProviderGrantMock).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      contactInboxId: "contact-inbox-1",
      status: "temporary",
      expirationTimestamp: 1_790_000_000,
    })
  })

  test("a failed mirror write never fails the read it rode along with", async () => {
    getCallPermissionsMock.mockResolvedValue({
      permission: { status: "permanent" },
      actions: [],
    })
    mirrorProviderGrantMock.mockRejectedValue(new Error("write failed"))

    await expect(call()).resolves.toMatchObject({
      permissionStatus: "permanent",
    })
  })

  test("nothing is mirrored when Meta could not be reached", async () => {
    getCallPermissionsMock.mockRejectedValue(new Error("meta down"))

    await call()

    expect(mirrorProviderGrantMock).not.toHaveBeenCalled()
  })

  test("Meta reporting a permanent grant flips the control to direct-dial — the wiped-mirror case", async () => {
    getCallPermissionsMock.mockResolvedValue({
      permission: { status: "permanent" },
      actions: [],
    })

    await expect(call()).resolves.toMatchObject({
      permissionStatus: "permanent",
    })
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
    // Key-aware: this action now caches two different Meta reads, and only
    // the calling-settings one is under test here.
    withCacheMock.mockImplementation(
      async (key: string, fn: () => Promise<unknown>) =>
        key.startsWith("whatsapp-outbound-call-mode:calling-settings:")
          ? { status: "ENABLED" }
          : await fn(),
    )

    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: "no_permission",
      unsignedWebhookWarning: false,
      manualCallsSubscriptionUnverified: false,
      integrationId: "integration-1",
    })
    expect(getCallingSettingsMock).not.toHaveBeenCalled()
  })
})
