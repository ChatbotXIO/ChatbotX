// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findPhoneNumberDetailMock,
  getAppWebhookSubscriptionsMock,
  loggerWarnMock,
  resolveForOwnerMock,
  resolveOwnerForWorkspaceMock,
} = vi.hoisted(() => ({
  findPhoneNumberDetailMock: vi.fn(),
  getAppWebhookSubscriptionsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resolveForOwnerMock: vi.fn(),
  resolveOwnerForWorkspaceMock: vi.fn(),
}))

vi.mock("server-only", () => ({}))

vi.mock("@/lib/log", () => ({
  logger: { warn: loggerWarnMock, error: vi.fn(), info: vi.fn() },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: resolveOwnerForWorkspaceMock,
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: { resolveForOwner: resolveForOwnerMock },
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/app-subscriptions", () => ({
  getAppWebhookSubscriptions: getAppWebhookSubscriptionsMock,
  WHATSAPP_APP_SUBSCRIPTION_OBJECT: {
    WHATSAPP_BUSINESS_ACCOUNT: "whatsapp_business_account",
  },
  WHATSAPP_APP_WEBHOOK_FIELDS: {
    CALLS: "calls",
    ACCOUNT_SETTINGS_UPDATE: "account_settings_update",
  },
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/phone-number", () => ({
  findPhoneNumberDetail: findPhoneNumberDetailMock,
}))

const { getWhatsappCallingPreflight } = await import(
  "../src/features/integration-whatsapp/calling/get-whatsapp-calling-preflight"
)

const AUTH = {
  metadata: { isManual: false, phoneNumber: { id: "phone-1" } },
} as unknown as Parameters<typeof getWhatsappCallingPreflight>[0]["auth"]
const WORKSPACE = {
  id: "ws-1",
  ownerId: "owner-1",
} as unknown as Parameters<typeof getWhatsappCallingPreflight>[0]["workspace"]

describe("getWhatsappCallingPreflight — messaging limit (Meta error 138015)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveOwnerForWorkspaceMock.mockResolvedValue("owner-1")
    resolveForOwnerMock.mockResolvedValue(undefined)
    getAppWebhookSubscriptionsMock.mockResolvedValue([])
  })

  test("reads whatsapp_business_manager_messaging_limit, not the deprecated messaging_limit_tier", async () => {
    findPhoneNumberDetailMock.mockResolvedValue({
      platform_type: "CLOUD_API",
      messaging_limit_tier: "TIER_100K",
      whatsapp_business_manager_messaging_limit: "TIER_250",
    })

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
    })

    expect(result.messagingLimitTier).toBe("TIER_250")
    expect(result.messagingLimitSufficient).toBe(false)
  })

  test.each([
    "TIER_50",
    "TIER_250",
    "TIER_1K",
  ])("%s is below Meta's '2000 or more' requirement", async (limit) => {
    findPhoneNumberDetailMock.mockResolvedValue({
      whatsapp_business_manager_messaging_limit: limit,
    })

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
    })

    expect(result.messagingLimitSufficient).toBe(false)
  })

  test.each([
    "TIER_2K",
    "TIER_10K",
    "TIER_100K",
    "TIER_UNLIMITED",
  ])("%s satisfies Meta's '2000 or more' requirement", async (limit) => {
    findPhoneNumberDetailMock.mockResolvedValue({
      whatsapp_business_manager_messaging_limit: limit,
    })

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
    })

    expect(result.messagingLimitSufficient).toBe(true)
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  test("a missing value counts as sufficient (never blocks on absence)", async () => {
    findPhoneNumberDetailMock.mockResolvedValue({})

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
    })

    expect(result.messagingLimitTier).toBeNull()
    expect(result.messagingLimitSufficient).toBe(true)
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  test("an unrecognized (e.g. future) tier counts as sufficient but is logged", async () => {
    findPhoneNumberDetailMock.mockResolvedValue({
      whatsapp_business_manager_messaging_limit: "TIER_5M",
    })

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
    })

    expect(result.messagingLimitSufficient).toBe(true)
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { limit: "TIER_5M" },
      expect.stringContaining("Unrecognized"),
    )
  })
})
