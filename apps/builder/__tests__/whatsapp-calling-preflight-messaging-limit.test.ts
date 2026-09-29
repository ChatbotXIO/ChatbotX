// @vitest-environment node
import { HTTPError } from "ky"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  findPhoneNumberDetailMock,
  getAppWebhookSubscriptionsMock,
  loggerWarnMock,
  resolveForOwnerMock,
  resolveOwnerForWorkspaceMock,
  getCallPermissionsMock,
  findContactInboxMock,
} = vi.hoisted(() => ({
  findPhoneNumberDetailMock: vi.fn(),
  getAppWebhookSubscriptionsMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  resolveForOwnerMock: vi.fn(),
  resolveOwnerForWorkspaceMock: vi.fn(),
  getCallPermissionsMock: vi.fn(),
  findContactInboxMock: vi.fn(),
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
  contactInboxService: { findBy: findContactInboxMock },
}))

vi.mock("@chatbotx.io/business/errors", async () => {
  // The real redactor - the probe's whole job is relaying Meta's sentence
  // safely, so stubbing it would prove nothing.
  const actual = await vi.importActual<
    typeof import("@chatbotx.io/business/errors")
  >("@chatbotx.io/business/errors")
  return { sanitizePublicText: actual.sanitizePublicText }
})

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("@chatbotx.io/integration-whatsapp/api/calling", () => ({
  getCallPermissions: getCallPermissionsMock,
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

describe("getWhatsappCallingPreflight — messaging limit", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveOwnerForWorkspaceMock.mockResolvedValue("owner-1")
    resolveForOwnerMock.mockResolvedValue(undefined)
    getAppWebhookSubscriptionsMock.mockResolvedValue([])
    findContactInboxMock.mockResolvedValue({ sourceId: "84339426550" })
    getCallPermissionsMock.mockResolvedValue({
      messaging_product: "whatsapp",
      permission: { status: "no_permission" },
      actions: [],
    })
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
      inboxId: "inbox-1",
    })

    expect(result.messagingLimitTier).toBe("TIER_250")
  })

  test.each([
    "TIER_50",
    "TIER_250",
    "TIER_1K",
    "TIER_2K",
    "TIER_UNLIMITED",
    // A tier Meta has not published yet must pass through untouched rather
    // than being judged against a list of ours that cannot know about it.
    "TIER_5M",
  ])("reports %s verbatim, judging none of them", async (limit) => {
    findPhoneNumberDetailMock.mockResolvedValue({
      whatsapp_business_manager_messaging_limit: limit,
    })

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
    })

    expect(result.messagingLimitTier).toBe(limit)
    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  test("a missing value is reported as null, never inferred", async () => {
    findPhoneNumberDetailMock.mockResolvedValue({})

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
    })

    expect(result.messagingLimitTier).toBeNull()
  })
})

/**
 * The shape `getCallPermissions` really rejects with: a ky `HTTPError`
 * carrying Meta's body, so the probe is exercised through the same parsing the
 * production path uses rather than a hand-built exception.
 */
const metaRefusal = (error: Record<string, unknown>) => {
  const body = { error: { code: 138_013, type: "OAuthException", ...error } }
  const httpError = new HTTPError(
    new Response(JSON.stringify(body), { status: 400 }),
    new Request("https://graph.facebook.com/v23.0/phone-1/call_permissions"),
    {} as ConstructorParameters<typeof HTTPError>[2],
  )
  Object.assign(httpError, { data: body })
  return httpError
}

describe("getWhatsappCallingPreflight — calling eligibility probe", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveOwnerForWorkspaceMock.mockResolvedValue("owner-1")
    resolveForOwnerMock.mockResolvedValue(undefined)
    getAppWebhookSubscriptionsMock.mockResolvedValue([])
    findPhoneNumberDetailMock.mockResolvedValue({ platform_type: "CLOUD_API" })
    findContactInboxMock.mockResolvedValue({ sourceId: "84339426550" })
  })

  test("does not call Meta unless the probe is asked for — the conversation-open path must not pay for it", async () => {
    await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
    })

    expect(getCallPermissionsMock).not.toHaveBeenCalled()
  })

  test("probes with the contact's wa_id and reports nothing when Meta answers", async () => {
    getCallPermissionsMock.mockResolvedValue({
      messaging_product: "whatsapp",
      permission: { status: "no_permission" },
      actions: [],
    })

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
      probeEligibility: true,
    })

    expect(getCallPermissionsMock).toHaveBeenCalledWith(AUTH, {
      userWaId: "84339426550",
    })
    expect(result.callingIneligibleReason).toBeNull()
  })

  test("prefers Meta's human sentences over its developer-facing message", async () => {
    getCallPermissionsMock.mockRejectedValue(
      metaRefusal({
        message:
          "Calling API not enabled. Enable calling via POST /{phone_number_id}/settings with calling configuration.",
        error_user_title: "Business-initiated calling not available",
        error_user_msg:
          "Business-initiated calls not available for this account.",
      }),
    )

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
      probeEligibility: true,
    })

    expect(result.callingIneligibleReason).toBe(
      "Business-initiated calling not available: Business-initiated calls not available for this account. (code 138013)",
    )
  })

  test("falls back to `message` only when Meta sent no human sentence", async () => {
    getCallPermissionsMock.mockRejectedValue(
      metaRefusal({
        message: "Calling API not enabled for this phone number.",
      }),
    )

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
      probeEligibility: true,
    })

    expect(result.callingIneligibleReason).toContain(
      "Calling API not enabled for this phone number.",
    )
  })

  test("prints a sentence Meta repeated across both fields only once", async () => {
    getCallPermissionsMock.mockRejectedValue(
      metaRefusal({
        message: "technical detail",
        error_user_title: "Same sentence",
        error_user_msg: "Same sentence",
      }),
    )

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
      probeEligibility: true,
    })

    expect(result.callingIneligibleReason).toBe("Same sentence (code 138013)")
  })

  test("addresses a Username/BSUID-only contact by recipient, like the dial does", async () => {
    findContactInboxMock.mockResolvedValue({
      sourceId: "VN.1506778474525162",
      sourceUserId: "VN.1506778474525162",
    })

    await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
      probeEligibility: true,
    })

    expect(getCallPermissionsMock).toHaveBeenCalledWith(AUTH, {
      recipient: "VN.1506778474525162",
    })
  })

  test("reports nothing when there is no contact to probe with", async () => {
    findContactInboxMock.mockResolvedValue(undefined)

    const result = await getWhatsappCallingPreflight({
      workspace: WORKSPACE,
      auth: AUTH,
      inboxId: "inbox-1",
      probeEligibility: true,
    })

    expect(getCallPermissionsMock).not.toHaveBeenCalled()
    expect(result.callingIneligibleReason).toBeNull()
  })
})
