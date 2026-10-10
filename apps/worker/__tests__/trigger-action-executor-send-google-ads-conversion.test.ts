import { beforeEach, describe, expect, test, vi } from "vitest"

// Covers the `sendGoogleAdsConversion` trigger-action branch of
// `ActionExecutor` (apps/worker/src/trigger/services/action-executor.ts):
// click-inbox resolution with fallback to the contact's latest clicked inbox,
// validation of the stored action, template resolution against the click
// inbox, and `googleAdsConversionService.record` outcomes. Mocking style
// mirrors trigger-action-executor-send-meta-capi-event.test.ts.

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
  findGoogleClickAttribution: vi.fn(),
  findLatestGoogleClickInboxByContact: vi.fn(),
  record: vi.fn(),
  getConsent: vi.fn(),
  logProviderError: vi.fn(),
  resolveContactVariablesDeep: vi.fn(
    async (_contactId: string, value: unknown) => value,
  ),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  metaCapiEventChannelSchema: { safeParse: () => ({ success: false }) },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findByIdForContact: (...args: unknown[]) =>
      mocks.findByIdForContact(...args),
    findMostRecentByContact: (...args: unknown[]) =>
      mocks.findMostRecentByContact(...args),
  },
}))

vi.mock("@chatbotx.io/business", async () => ({
  // Pure consent mapping stays real; only the settings read is mocked.
  ...(await vi.importActual<
    typeof import("../../../packages/business/src/google-ads/consent")
  >("../../../packages/business/src/google-ads/consent")),
  googleAdsSettingsService: {
    getConsent: (...args: unknown[]) => mocks.getConsent(...args),
  },
  contactCustomFieldService: {},
  conversationService: {
    findLatestCreatedByContact: (...args: unknown[]) =>
      mocks.findLatestCreatedByContact(...args),
  },
  tagService: {},
  tagSyncService: {},
  adsConversionService: {},
  flowService: {},
  workspaceMemberService: {},
  inboxService: {},
  metaConversionsService: {},
  contactInboxService: {
    findGoogleClickAttribution: (...args: unknown[]) =>
      mocks.findGoogleClickAttribution(...args),
    findLatestGoogleClickInboxByContact: (...args: unknown[]) =>
      mocks.findLatestGoogleClickInboxByContact(...args),
  },
  googleAdsConversionService: {
    record: (...args: unknown[]) => mocks.record(...args),
  },
}))

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: (...args: unknown[]) => mocks.logProviderError(...args),
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))

vi.mock("@chatbotx.io/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  getChildLogger: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep: (...args: [string, unknown, unknown]) =>
    mocks.resolveContactVariablesDeep(...args),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: vi.fn() },
}))

vi.mock("../src/integration/handlers/spreadsheet-handler", () => ({
  clearSpreadsheetRow: vi.fn(),
  getSpreadsheetRandomRow: vi.fn(),
  getSpreadsheetRow: vi.fn(),
  sendSpreadsheetData: vi.fn(),
  updateSpreadsheetRow: vi.fn(),
}))

const { ActionExecutor } = await import(
  "../src/trigger/services/action-executor"
)
const baseLogger = (await import("@chatbotx.io/logger")).default

const CLICK_ID = "gclid-secret-1234567890"
const MESSENGER_INBOX = {
  id: "ci-messenger",
  inboxId: "inbox-messenger",
  channel: "messenger",
  sourceId: "psid-1",
}
const WHATSAPP_CLICK_INBOX = {
  id: "ci-whatsapp",
  channel: "whatsapp",
  contactId: "contact-1",
  sourceId: "wa-source-1",
  referral: { gclid: CLICK_ID },
}

const NOT_PROVIDED_CONSENT = {
  adUserData: { type: "notProvided" },
  adPersonalization: { type: "notProvided" },
}

const run = (action: Record<string, unknown>, occurrenceKey?: string) =>
  new ActionExecutor().execute({
    action: { type: "sendGoogleAdsConversion", ...action },
    contactId: "contact-1",
    triggerId: "trigger-1",
    workspaceId: "ws-1",
    occurrenceKey,
  })

describe("ActionExecutor sendGoogleAdsConversion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveContactVariablesDeep.mockImplementation(
      async (_contactId: string, value: unknown) => value,
    )
    mocks.findLatestCreatedByContact.mockResolvedValue({
      id: "conv-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
    mocks.findMostRecentByContact.mockResolvedValue(MESSENGER_INBOX)
    mocks.findGoogleClickAttribution.mockResolvedValue(null)
    mocks.findLatestGoogleClickInboxByContact.mockResolvedValue(
      WHATSAPP_CLICK_INBOX,
    )
    mocks.record.mockResolvedValue({ status: "queued" })
    mocks.getConsent.mockResolvedValue({
      status: "absent",
      consent: NOT_PROVIDED_CONSENT,
    })
  })

  test("falls back to the latest clicked inbox when the resolved inbox has no click", async () => {
    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(mocks.findLatestGoogleClickInboxByContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(mocks.record).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-whatsapp",
      source: "triggerAction",
      scopeId: "trigger-1",
      conversionActionId: "123",
      value: undefined,
      currency: undefined,
      recordedAt: expect.any(Date),
      dedupMode: "click",
      dedupId: undefined,
      conversionTime: undefined,
      consent: {
        adUserData: { status: null, source: "notProvided" },
        adPersonalization: { status: null, source: "notProvided" },
      },
    })
    expect(mocks.resolveContactVariablesDeep).toHaveBeenCalledWith(
      "contact-1",
      expect.any(Object),
      expect.objectContaining({ contactInbox: "ci-whatsapp" }),
    )
  })

  test("uses the resolved inbox when it carries a click", async () => {
    mocks.findGoogleClickAttribution.mockResolvedValue({
      id: "ci-messenger",
      channel: "messenger",
      contactId: "contact-1",
      referral: { gbraid: "gbraid-1234567890" },
    })

    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(mocks.findLatestGoogleClickInboxByContact).not.toHaveBeenCalled()
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ contactInboxId: "ci-messenger" }),
    )
  })

  test("forwards resolved template values to record", async () => {
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      value: "49.90",
      currency: "USD",
      dedupId: "order-9",
      conversionTime: "2026-10-01T10:00:00Z",
      consent: {},
    })

    await run({
      conversionActionId: "123",
      dedupMode: "id",
      value: "{{total}}",
      currency: "USD",
      dedupId: "{{order}}",
      conversionTime: "{{closed_at}}",
    })

    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "49.90",
        currency: "USD",
        dedupMode: "id",
        dedupId: "order-9",
        conversionTime: "2026-10-01T10:00:00Z",
      }),
    )
  })

  test("an id-mode action without a dedupId logs the code, then a plain `path: key` line", async () => {
    await run({ conversionActionId: "123", dedupMode: "id" })

    const message = mocks.logProviderError.mock.calls[0]?.[0].error.message
    const lines = message.split("\n")
    expect(lines[0]).toBe("google_ads_invalid_input")
    expect(lines[1]).toBe(
      "dedupId: googleAds.conversionFields.validation.dedupIdRequired",
    )
    expect(message).not.toContain("✖")
  })

  test("skips with a warning when no inbox carries a click", async () => {
    mocks.findLatestGoogleClickInboxByContact.mockResolvedValue(null)

    await expect(
      run({ conversionActionId: "123", dedupMode: "click" }),
    ).resolves.toBeUndefined()

    expect(mocks.record).not.toHaveBeenCalled()
    expect(baseLogger.warn).toHaveBeenCalled()
  })

  test.each([
    ["non-numeric action id", { conversionActionId: "abc" }],
    ["missing action id", {}],
    [
      "value without currency",
      { conversionActionId: "1", dedupMode: "click", value: "5" },
    ],
    ["missing dedup mode", { conversionActionId: "1" }],
    ["id mode without an ID", { conversionActionId: "1", dedupMode: "id" }],
    [
      "id mode with a 65-character ID",
      { conversionActionId: "1", dedupMode: "id", dedupId: "x".repeat(65) },
    ],
  ])("invalid stored action (%s) logs an error and never records", async (_name, fields) => {
    await run(fields)

    expect(mocks.record).not.toHaveBeenCalled()
    expect(mocks.logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google-ads", workspaceId: "ws-1" }),
    )
  })

  test("invalidValue outcome (template resolved to garbage) is reported to the error log without the click id", async () => {
    mocks.record.mockResolvedValue({ status: "invalidValue" })
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      value: "250Hung",
      currency: "USD",
      consent: {},
    })

    await run({
      conversionActionId: "123",
      dedupMode: "click",
      value: "{{v}}",
      currency: "USD",
    })

    expect(mocks.logProviderError).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(
      mocks.logProviderError.mock.calls[0]?.[0]?.error?.message,
    )
    expect(logged).toContain("250Hung")
    expect(logged).not.toContain(CLICK_ID)
  })

  test.each([
    ["invalidValue", "google_ads_invalid_value"],
    ["missingDedupId", "google_ads_missing_dedup_id"],
    ["invalidDedupId", "google_ads_invalid_dedup_id"],
    ["invalidConversionTime", "google_ads_invalid_conversion_time"],
    ["invalidCustomerProperty", "google_ads_invalid_customer_property"],
  ])("%s outcome warns and logs the code on line 1, tagged with the trigger", async (status, code) => {
    mocks.record.mockResolvedValue({ status })

    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(baseLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(status),
    )
    const message = mocks.logProviderError.mock.calls[0]?.[0].error.message
    expect(message.split("\n")[0]).toBe(code)
    expect(message).toContain("Trigger: trigger-1")
    expect(message).not.toContain(CLICK_ID)
  })

  test("the Error Log dump never carries consent or the dedup mode", async () => {
    mocks.record.mockResolvedValue({ status: "missingDedupId" })
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      value: "5",
      currency: "USD",
      consent: {},
    })

    await run({ conversionActionId: "123", dedupMode: "id", dedupId: "{{o}}" })

    const message = mocks.logProviderError.mock.calls[0]?.[0].error.message
    expect(message).toContain('value="5"')
    expect(message).not.toContain("consent")
    expect(message).not.toContain("dedupMode")
  })

  test("resolves the fields and the consent templates in ONE deep call", async () => {
    mocks.getConsent.mockResolvedValue({
      status: "ok",
      consent: {
        adUserData: { type: "variable", template: "{{gdpr}}" },
        adPersonalization: { type: "granted" },
      },
    })
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      dedupId: "o-1",
      consent: { adUserData: "Denied" },
    })

    await run({ conversionActionId: "123", dedupMode: "id", dedupId: "{{o}}" })

    expect(mocks.resolveContactVariablesDeep).toHaveBeenCalledTimes(1)
    expect(mocks.resolveContactVariablesDeep).toHaveBeenCalledWith(
      "contact-1",
      expect.objectContaining({ consent: { adUserData: "{{gdpr}}" } }),
      expect.anything(),
    )
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        consent: {
          adUserData: { status: "denied", source: "variable" },
          adPersonalization: { status: "granted", source: "fixed" },
        },
      }),
    )
  })

  test("an unreadable stored consent logs google_ads_invalid_consent_config, warns and records nothing", async () => {
    mocks.getConsent.mockResolvedValue({ status: "invalid" })

    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(mocks.record).not.toHaveBeenCalled()
    expect(baseLogger.warn).toHaveBeenCalled()
    const message = mocks.logProviderError.mock.calls[0]?.[0].error.message
    expect(message.split("\n")[0]).toBe("google_ads_invalid_consent_config")
  })

  test("an unrecognised consent value names the setting, never the value, and records nothing", async () => {
    mocks.getConsent.mockResolvedValue({
      status: "ok",
      consent: {
        adUserData: { type: "notProvided" },
        adPersonalization: { type: "variable", template: "{{gdpr}}" },
      },
    })
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      consent: { adPersonalization: "yes-secret" },
    })

    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(mocks.record).not.toHaveBeenCalled()
    const message = mocks.logProviderError.mock.calls[0]?.[0].error.message
    expect(message).toContain("google_ads_invalid_consent_value")
    expect(message).toContain("Setting: adPersonalization")
    expect(message).not.toContain("yes-secret")
    expect(JSON.stringify(vi.mocked(baseLogger.warn).mock.calls)).not.toContain(
      "yes-secret",
    )
  })

  test("recordedAt is read before the template resolution", async () => {
    let resolvedAt = 0
    mocks.resolveContactVariablesDeep.mockImplementation(
      async (_contactId: string, value: unknown) => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        resolvedAt = Date.now()
        return value
      },
    )

    await run({ conversionActionId: "123", dedupMode: "click" })

    const recordedAt: Date = mocks.record.mock.calls[0]?.[0].recordedAt
    expect(recordedAt.getTime()).toBeLessThan(resolvedAt)
  })

  test("identity never comes from message or job ids", async () => {
    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(mocks.record.mock.calls[0]?.[0]).not.toHaveProperty(
      "triggerMessageId",
    )
  })

  describe("customer matching sources", () => {
    test("forwards the stored variables from the validated action", async () => {
      await run({
        conversionActionId: "123",
        dedupMode: "click",
        matchEmail: "{{email}}",
        matchPhone: "{{phone}}",
      })

      expect(mocks.record.mock.calls[0]?.[0]).toMatchObject({
        matchEmail: "{{email}}",
        matchPhone: "{{phone}}",
      })
    })

    test("an action saved before customer matching forwards nothing", async () => {
      await run({ conversionActionId: "123", dedupMode: "click" })

      expect(mocks.record.mock.calls[0]?.[0].matchEmail).toBeUndefined()
    })

    test("a literal e-mail fails the stored-action validation and records nothing", async () => {
      await run({
        conversionActionId: "123",
        dedupMode: "click",
        matchEmail: "jane@example.com",
      })

      expect(mocks.record).not.toHaveBeenCalled()
    })
  })

  describe("customer properties", () => {
    test("forwards the values from the validated action", async () => {
      await run({
        conversionActionId: "123",
        dedupMode: "click",
        customerType: "returning",
        customerValueBucket: "HIGH",
      })

      expect(mocks.record.mock.calls[0]?.[0]).toMatchObject({
        customerType: "RETURNING",
        customerValueBucket: "HIGH",
      })
    })

    test("an action saved before customer properties forwards nothing", async () => {
      await run({ conversionActionId: "123", dedupMode: "click" })

      expect(mocks.record.mock.calls[0]?.[0].customerType).toBeUndefined()
    })

    test("a value outside the allowed ones fails the stored-action validation and records nothing", async () => {
      await run({
        conversionActionId: "123",
        dedupMode: "click",
        customerType: "VIP",
      })

      expect(mocks.record).not.toHaveBeenCalled()
    })
  })

  describe("event dedup (every run is its own conversion)", () => {
    test("passes the occurrence key joined with the contact", async () => {
      await run(
        { conversionActionId: "123", dedupMode: "event" },
        "trigger:job-9:trigger-1:0",
      )

      expect(mocks.record.mock.calls[0]?.[0]).toMatchObject({
        dedupMode: "event",
        occurrenceKey: "trigger:job-9:trigger-1:0:contact-1",
      })
    })

    test("a replay keeps the key even when the attributable click inbox changed", async () => {
      await run(
        { conversionActionId: "123", dedupMode: "event" },
        "trigger:job-9:trigger-1:0",
      )
      mocks.findLatestGoogleClickInboxByContact.mockResolvedValue({
        ...WHATSAPP_CLICK_INBOX,
        id: "ci-newer",
      })
      await run(
        { conversionActionId: "123", dedupMode: "event" },
        "trigger:job-9:trigger-1:0",
      )

      expect(mocks.record.mock.calls[0]?.[0].occurrenceKey).toBe(
        mocks.record.mock.calls[1]?.[0].occurrenceKey,
      )
    })

    test("passes no key when the producer has none, so record refuses", async () => {
      mocks.record.mockResolvedValue({ status: "missingOccurrenceKey" })

      await run({ conversionActionId: "123", dedupMode: "event" })

      expect(mocks.record.mock.calls[0]?.[0].occurrenceKey).toBeUndefined()
      expect(baseLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("missingOccurrenceKey"),
      )
    })

    test("click and id modes never receive the key", async () => {
      await run(
        { conversionActionId: "123", dedupMode: "click" },
        "trigger:job-9:trigger-1:0",
      )

      expect(mocks.record.mock.calls[0]?.[0].occurrenceKey).toBeUndefined()
    })

    test("accepts the stored action without a dedupId", async () => {
      await run(
        { conversionActionId: "123", dedupMode: "event" },
        "trigger:job-9:trigger-1:0",
      )

      expect(mocks.record).toHaveBeenCalledTimes(1)
    })
  })

  test("invalidValue outcome is attributed to the click inbox sourceId", async () => {
    mocks.record.mockResolvedValue({ status: "invalidValue" })

    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(mocks.logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: "wa-source-1" }),
    )
  })

  test("a record failure logs a message string only, never the raw error", async () => {
    mocks.record.mockRejectedValueOnce(new Error("insert failed [redacted]"))

    await expect(
      run({ conversionActionId: "123", dedupMode: "click" }),
    ).resolves.toBeUndefined()

    const calls = vi.mocked(baseLogger.error).mock.calls
    expect(calls).toHaveLength(1)
    expect(typeof calls[0]?.[0]).toBe("string")
    expect(calls[0]?.[0]).toContain("insert failed [redacted]")
  })

  test.each([
    "noClick",
    "noAccount",
    "unknownConversionAction",
    "actionDisabled",
    "incompatibleAction",
    "unsupportedAction",
  ])("%s outcome warns without an error log entry", async (status) => {
    mocks.record.mockResolvedValue({ status })

    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(mocks.logProviderError).not.toHaveBeenCalled()
    expect(baseLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(status),
    )
  })

  test("queued outcome neither warns nor logs an error", async () => {
    await run({ conversionActionId: "123", dedupMode: "click" })

    expect(mocks.logProviderError).not.toHaveBeenCalled()
    expect(baseLogger.warn).not.toHaveBeenCalled()
  })
})
