// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ActionHandler = (args: {
  bindArgsParsedInputs: readonly [string]
  parsedInput: Record<string, unknown>
}) => Promise<unknown>

const {
  findByMock,
  findInboxMock,
  findByInboxIdForWorkspaceMock,
  findByContactInboxIdMock,
  findWorkspaceByIdMock,
  getCallingSettingsMock,
  getWhatsappCallingPreflightMock,
  withCacheMock,
} = vi.hoisted(() => ({
  findByMock: vi.fn(),
  findInboxMock: vi.fn(),
  findByInboxIdForWorkspaceMock: vi.fn(),
  findByContactInboxIdMock: vi.fn(),
  findWorkspaceByIdMock: vi.fn(),
  getCallingSettingsMock: vi.fn(),
  getWhatsappCallingPreflightMock: vi.fn(),
  // Pass through to the wrapped fetcher by default — individual tests
  // override this to assert cache-hit/short-circuit behavior.
  withCacheMock: vi.fn(
    async (_key: string, fn: () => Promise<unknown>) => await fn(),
  ),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (handler: unknown) => handler
  return { workspaceActionClient: chain }
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
  conversationService: { findBy: findByMock },
  contactInboxService: { findBy: findInboxMock },
  workspaceService: { findById: findWorkspaceByIdMock },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: {
    findByInboxIdForWorkspace: findByInboxIdForWorkspaceMock,
  },
  whatsappCallPermissionRepository: {
    findByContactInboxId: findByContactInboxIdMock,
  },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
}))

const { resolveOutboundCallModeAction } = await import(
  "../src/features/integration-whatsapp/calling/actions/resolve-outbound-call-mode.action"
)
const action = resolveOutboundCallModeAction as unknown as ActionHandler

const call = (conversationId = "conversation-1") =>
  action({
    bindArgsParsedInputs: ["workspace-1"],
    parsedInput: { conversationId },
  })

describe("resolveOutboundCallModeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    withCacheMock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => await fn(),
    )
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
      sipProvisioningStatus: "provisioned",
      displayPhoneNumber: "+44 20 7946 0958",
    })
    findByContactInboxIdMock.mockResolvedValue(undefined)
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

  test("throws when the conversation cannot be found", async () => {
    findByMock.mockResolvedValue(undefined)
    await expect(call()).rejects.toThrow("whatsapp.calls.errors.callNotFound")
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

  test("returns none/manualIntegrationNoCredentials for a manually-connected number", async () => {
    getWhatsappCallingPreflightMock.mockResolvedValue({
      isManual: true,
      hasAppCredential: false,
      callsSubscribed: null,
      platformType: null,
      isCloudApiPlatform: null,
      messagingLimitTier: null,
      messagingLimitSufficient: true,
    })
    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "manualIntegrationNoCredentials",
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
      sipProvisioningStatus: "provisioned",
      displayPhoneNumber: "+234 810 123 4567",
    })
    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "ineligibleNumber",
    })
  })

  test("returns none/ineligibleNumber for a blocked business country (TR)", async () => {
    findByInboxIdForWorkspaceMock.mockResolvedValue({
      id: "integration-1",
      sipProvisioningStatus: "provisioned",
      displayPhoneNumber: "+90 532 123 4567",
    })
    await expect(call()).resolves.toEqual({
      mode: "none",
      reason: "ineligibleNumber",
    })
  })

  test("returns voip with permissionStatus undefined when no permission row exists", async () => {
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
    })
  })

  test("returns voip/no_permission when the contact rejected the request", async () => {
    findByContactInboxIdMock.mockResolvedValue({
      response: "reject",
      isPermanent: false,
      expiresAt: null,
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: "no_permission",
    })
  })

  test("returns voip/permanent when the contact accepted permanently", async () => {
    findByContactInboxIdMock.mockResolvedValue({
      response: "accept",
      isPermanent: true,
      expiresAt: null,
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: "permanent",
    })
  })

  test("returns voip/temporary when the contact accepted and the temporary grant has not expired", async () => {
    findByContactInboxIdMock.mockResolvedValue({
      response: "accept",
      isPermanent: false,
      expiresAt: new Date(Date.now() + 60_000),
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: "temporary",
    })
  })

  test("returns voip/no_permission when the temporary grant has expired", async () => {
    findByContactInboxIdMock.mockResolvedValue({
      response: "accept",
      isPermanent: false,
      expiresAt: new Date(Date.now() - 60_000),
    })
    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: "no_permission",
    })
  })

  test("never calls Meta's rate-limited call_permissions GET", async () => {
    await call()
    // No fetch/ky mock is wired for the Graph client in this test at all —
    // if the resolver ever called it, the module import would need
    // `@chatbotx.io/integration-whatsapp/api/calling` mocked here and it
    // deliberately is not.
    expect(findByContactInboxIdMock).toHaveBeenCalledWith("contact-inbox-1")
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

  test("a cache hit skips the live Meta GET entirely", async () => {
    withCacheMock.mockResolvedValue({ status: "ENABLED" })

    await expect(call()).resolves.toEqual({
      mode: "voip",
      permissionStatus: undefined,
    })
    expect(getCallingSettingsMock).not.toHaveBeenCalled()
  })
})
