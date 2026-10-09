import { beforeEach, describe, expect, test, vi } from "vitest"

// Covers `handleSendGoogleAdsConversionStep`
// (apps/worker/src/integration/handlers/google-ads/): channel gate, template
// resolution (real resolver over a mocked `contactVariableService.getAll`),
// the `record` call shape, and the mapping of every outcome to the step's
// success / error branch with a stable error code.

const mocks = vi.hoisted(() => ({
  record: vi.fn(),
  getConsent: vi.fn(),
  getAll: vi.fn(),
  logProviderError: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/business")>(
    "@chatbotx.io/business",
  )
  return {
    ...actual,
    googleAdsConversionService: { record: mocks.record },
    googleAdsSettingsService: { getConsent: mocks.getConsent },
  }
})

vi.mock("../../../packages/variables/src/contact-variable", async () => {
  const actual = await vi.importActual<
    typeof import("../../../packages/variables/src/contact-variable")
  >("../../../packages/variables/src/contact-variable")
  return {
    ...actual,
    contactVariableService: {
      ...actual.contactVariableService,
      getAll: mocks.getAll,
    },
  }
})

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: (...args: unknown[]) => mocks.logProviderError(...args),
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: (...args: unknown[]) => mocks.loggerWarn(...args),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const { handleSendGoogleAdsConversionStep } = await import(
  "../src/integration/handlers/google-ads/send-google-ads-conversion-step-handler"
)

const CLICK_ID = "gclid-secret-1234567890"

const baseStep = {
  id: "step-1",
  stepType: "sendGoogleAdsConversion" as const,
  conversionActionId: "123",
  value: undefined as string | undefined,
  currency: undefined as string | undefined,
  dedupMode: "click" as "click" | "id" | "event",
  dedupId: undefined as string | undefined,
  conversionTime: undefined as string | undefined,
  matchEmail: undefined as string | undefined,
  matchPhone: undefined as string | undefined,
  customerType: undefined as string | undefined,
  customerValueBucket: undefined as string | undefined,
}

const NOT_PROVIDED_CONSENT = {
  adUserData: { type: "notProvided" },
  adPersonalization: { type: "notProvided" },
}
const NOT_PROVIDED_INPUT = {
  adUserData: { status: null, source: "notProvided" },
  adPersonalization: { status: null, source: "notProvided" },
}

function props(
  channel: string,
  step: typeof baseStep = baseStep,
  triggerMessageId?: string,
) {
  return {
    contactInbox: {
      id: "ci-1",
      inboxId: "inbox-1",
      channel,
      sourceId: "src-1",
    },
    conversation: { id: "conv-1", workspaceId: "ws-1", contactId: "contact-1" },
    step,
    triggerMessageId,
  } as unknown as Parameters<typeof handleSendGoogleAdsConversionStep>[0]
}

function variableContext(customFieldValue: string, consent = "granted") {
  return {
    contact: { id: "contact-1", timezone: null },
    contactInbox: null,
    conversation: null,
    customFieldsMap: new Map([
      [
        "amount",
        {
          key: "amount",
          type: "text",
          value: customFieldValue,
          description: "",
        },
      ],
      ["gdpr", { key: "gdpr", type: "text", value: consent, description: "" }],
    ]),
    botFieldsMap: new Map(),
    workspace: null,
  }
}

describe("handleSendGoogleAdsConversionStep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.record.mockResolvedValue({ status: "queued", event: { id: "e-1" } })
    mocks.getConsent.mockResolvedValue({
      status: "absent",
      consent: NOT_PROVIDED_CONSENT,
    })
  })

  test.each([
    "whatsapp",
    "messenger",
  ])("records a conversion for %s and returns success", async (channel) => {
    const result = await handleSendGoogleAdsConversionStep(
      props(channel, baseStep, "msg-1"),
    )

    expect(mocks.record).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      source: "flowStep",
      scopeId: "step-1",
      conversionActionId: "123",
      value: undefined,
      currency: undefined,
      recordedAt: expect.any(Date),
      dedupMode: "click",
      dedupId: undefined,
      conversionTime: undefined,
      consent: NOT_PROVIDED_INPUT,
    })
    expect(result).toEqual({ status: "success", result: null })
  })

  test.each([
    "instagram",
    "telegram",
    "webchat",
  ])("maps the unsupportedChannel outcome for %s to a stable code", async (channel) => {
    mocks.record.mockResolvedValue({ status: "unsupportedChannel" })
    const result = await handleSendGoogleAdsConversionStep(props(channel))

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: "google_ads_unsupported_channel",
    })
  })

  test("static values never load contact variables", async () => {
    await handleSendGoogleAdsConversionStep(
      props("whatsapp", {
        ...baseStep,
        value: "9.99",
        currency: "USD",
        dedupMode: "id",
        dedupId: "o-1",
      }),
    )

    expect(mocks.getAll).not.toHaveBeenCalled()
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        value: "9.99",
        currency: "USD",
        dedupMode: "id",
        dedupId: "o-1",
      }),
    )
  })

  test("resolves {{variable}} templates before recording", async () => {
    mocks.getAll.mockResolvedValue(variableContext("49.90"))

    await handleSendGoogleAdsConversionStep(
      props("whatsapp", {
        ...baseStep,
        value: "{{amount}}",
        currency: "USD",
      }),
    )

    expect(mocks.getAll).toHaveBeenCalledTimes(1)
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ value: "49.90", currency: "USD" }),
    )
  })

  test.each([
    ["noClick", "google_ads_no_click"],
    ["noAccount", "google_ads_no_account"],
    ["unknownConversionAction", "google_ads_unknown_conversion_action"],
    ["actionDisabled", "google_ads_action_disabled"],
    ["incompatibleAction", "google_ads_incompatible_action"],
    ["unsupportedAction", "google_ads_unsupported_action"],
    ["missingOccurrenceKey", "google_ads_missing_occurrence_key"],
  ])("maps outcome %s to the error branch with code %s", async (status, code) => {
    mocks.record.mockResolvedValue({ status })

    const result = await handleSendGoogleAdsConversionStep(props("whatsapp"))

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: code,
    })
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })

  test("invalidValue is logged to the error log with the resolved values and no click id", async () => {
    mocks.record.mockResolvedValue({ status: "invalidValue" })
    mocks.getAll.mockResolvedValue(variableContext("250Hung"))

    const result = await handleSendGoogleAdsConversionStep(
      props("whatsapp", {
        ...baseStep,
        value: "{{amount}}",
        currency: "USD",
      }),
    )

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: "google_ads_invalid_value",
    })
    expect(mocks.logProviderError).toHaveBeenCalledTimes(1)
    const call = mocks.logProviderError.mock.calls[0]?.[0]
    expect(call).toEqual(
      expect.objectContaining({
        provider: "google-ads",
        workspaceId: "ws-1",
        contactId: "contact-1",
        sourceId: "src-1",
      }),
    )
    expect(call.error.message).toContain("250Hung")
    expect(call.error.message).not.toContain(CLICK_ID)
  })

  test.each([
    ["missingDedupId", "google_ads_missing_dedup_id"],
    ["invalidDedupId", "google_ads_invalid_dedup_id"],
    ["invalidConversionTime", "google_ads_invalid_conversion_time"],
  ])("%s is logged with the code on line 1 and returns %s", async (status, code) => {
    mocks.record.mockResolvedValue({ status })
    mocks.getAll.mockResolvedValue(variableContext("A-1042"))

    const result = await handleSendGoogleAdsConversionStep(
      props("whatsapp", {
        ...baseStep,
        dedupMode: "id",
        dedupId: "{{amount}}",
      }),
    )

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: code,
    })
    expect(mocks.logProviderError).toHaveBeenCalledTimes(1)
    const call = mocks.logProviderError.mock.calls[0]?.[0]
    expect(call.error.message.split("\n")[0]).toBe(code)
    expect(call.error.message).toContain("dedupId")
    expect(call.error.message).not.toContain(CLICK_ID)
  })

  test("the Error Log dump holds only the resolved step fields: no consent, no mode", async () => {
    mocks.record.mockResolvedValue({ status: "invalidValue" })
    mocks.getConsent.mockResolvedValue({
      status: "ok",
      consent: {
        adUserData: { type: "variable", template: "{{gdpr}}" },
        adPersonalization: { type: "granted" },
      },
    })
    mocks.getAll.mockResolvedValue(variableContext("250Hung"))

    await handleSendGoogleAdsConversionStep(
      props("whatsapp", {
        ...baseStep,
        value: "{{amount}}",
        currency: "USD",
        dedupMode: "id",
        dedupId: "o-1",
      }),
    )

    const message = mocks.logProviderError.mock.calls[0]?.[0].error.message
    expect(message).toContain(
      'Resolved: value="250Hung", currency="USD", dedupId="o-1"',
    )
    expect(message).not.toContain("consent")
    expect(message).not.toContain("granted")
    expect(message).not.toContain("dedupMode")
  })

  describe("workspace consent", () => {
    test("loads the consent without any connection and resolves it in ONE deep call", async () => {
      mocks.getConsent.mockResolvedValue({
        status: "ok",
        consent: {
          adUserData: { type: "variable", template: "{{gdpr}}" },
          adPersonalization: { type: "denied" },
        },
      })
      mocks.getAll.mockResolvedValue(variableContext("49.90", " GRANTED "))

      await handleSendGoogleAdsConversionStep(
        props("whatsapp", {
          ...baseStep,
          value: "{{amount}}",
          currency: "USD",
        }),
      )

      expect(mocks.getConsent).toHaveBeenCalledWith("ws-1")
      expect(mocks.getAll).toHaveBeenCalledTimes(1)
      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          value: "49.90",
          consent: {
            adUserData: { status: "granted", source: "variable" },
            adPersonalization: { status: "denied", source: "fixed" },
          },
        }),
      )
    })

    test("fixed consent alone loads no contact variables", async () => {
      mocks.getConsent.mockResolvedValue({
        status: "ok",
        consent: {
          adUserData: { type: "granted" },
          adPersonalization: { type: "denied" },
        },
      })

      await handleSendGoogleAdsConversionStep(props("whatsapp"))

      expect(mocks.getAll).not.toHaveBeenCalled()
    })

    test("an empty variable consent is omitted, not an error", async () => {
      mocks.getConsent.mockResolvedValue({
        status: "ok",
        consent: {
          adUserData: { type: "variable", template: "{{gdpr}}" },
          adPersonalization: { type: "notProvided" },
        },
      })
      mocks.getAll.mockResolvedValue(variableContext("1", "  "))

      const result = await handleSendGoogleAdsConversionStep(props("whatsapp"))

      expect(result.status).toBe("success")
      expect(mocks.record).toHaveBeenCalledWith(
        expect.objectContaining({
          consent: expect.objectContaining({
            adUserData: { status: null, source: "variable" },
          }),
        }),
      )
    })

    test("an unreadable stored consent fails with google_ads_invalid_consent_config and records nothing", async () => {
      mocks.getConsent.mockResolvedValue({ status: "invalid" })

      const result = await handleSendGoogleAdsConversionStep(props("whatsapp"))

      expect(result).toEqual({
        status: "error",
        result: null,
        errorMessage: "google_ads_invalid_consent_config",
      })
      expect(mocks.record).not.toHaveBeenCalled()
      const call = mocks.logProviderError.mock.calls[0]?.[0]
      expect(call.error.message).toBe("google_ads_invalid_consent_config")
    })

    test("an unrecognised value fails naming the setting, never printing the value", async () => {
      mocks.getConsent.mockResolvedValue({
        status: "ok",
        consent: {
          adUserData: { type: "variable", template: "{{gdpr}}" },
          adPersonalization: { type: "notProvided" },
        },
      })
      mocks.getAll.mockResolvedValue(variableContext("1", "maybe-secret-yes"))

      const result = await handleSendGoogleAdsConversionStep(props("whatsapp"))

      expect(result).toEqual({
        status: "error",
        result: null,
        errorMessage: "google_ads_invalid_consent_value",
      })
      expect(mocks.record).not.toHaveBeenCalled()
      const message = mocks.logProviderError.mock.calls[0]?.[0].error.message
      expect(message).toBe(
        "google_ads_invalid_consent_value\nSetting: adUserData",
      )
      expect(message).not.toContain("maybe-secret-yes")
    })
  })

  test("recordedAt is read before the template resolution", async () => {
    let resolvedAt = 0
    mocks.getAll.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      resolvedAt = Date.now()
      return variableContext("49.90")
    })

    await handleSendGoogleAdsConversionStep(
      props("whatsapp", { ...baseStep, value: "{{amount}}", currency: "USD" }),
    )

    const recordedAt: Date = mocks.record.mock.calls[0]?.[0].recordedAt
    expect(recordedAt.getTime()).toBeLessThan(resolvedAt)
  })

  test("identity never comes from message or job ids", async () => {
    const withKeys = {
      ...props("whatsapp", baseStep, "msg-1"),
      flowExecutionKey: "job-42",
    } as unknown as Parameters<typeof handleSendGoogleAdsConversionStep>[0]

    await handleSendGoogleAdsConversionStep(withKeys)

    const sent = mocks.record.mock.calls[0]?.[0]
    expect(JSON.stringify(sent)).not.toContain("msg-1")
    expect(JSON.stringify(sent)).not.toContain("job-42")
    expect(sent).not.toHaveProperty("triggerMessageId")
  })

  describe("customer matching sources", () => {
    test("passes the stored variables to record unresolved: they are resolved at delivery", async () => {
      await handleSendGoogleAdsConversionStep(
        props("whatsapp", {
          ...baseStep,
          matchEmail: "{{email}}",
          matchPhone: "{{phone}}",
        }),
      )

      expect(mocks.record.mock.calls[0]?.[0]).toMatchObject({
        matchEmail: "{{email}}",
        matchPhone: "{{phone}}",
      })
    })

    test("a step saved before customer matching passes nothing", async () => {
      await handleSendGoogleAdsConversionStep(props("whatsapp"))

      expect(mocks.record.mock.calls[0]?.[0].matchEmail).toBeUndefined()
      expect(mocks.record.mock.calls[0]?.[0].matchPhone).toBeUndefined()
    })
  })

  describe("customer properties", () => {
    test("resolves the templates and passes the values to record", async () => {
      mocks.getAll.mockResolvedValue(variableContext("returning"))

      await handleSendGoogleAdsConversionStep(
        props("whatsapp", {
          ...baseStep,
          customerType: "{{amount}}",
          customerValueBucket: "HIGH",
        }),
      )

      expect(mocks.record.mock.calls[0]?.[0]).toMatchObject({
        customerType: "returning",
        customerValueBucket: "HIGH",
      })
    })

    test("a step saved before customer properties passes nothing", async () => {
      await handleSendGoogleAdsConversionStep(props("whatsapp"))

      expect(mocks.record.mock.calls[0]?.[0].customerType).toBeUndefined()
      expect(
        mocks.record.mock.calls[0]?.[0].customerValueBucket,
      ).toBeUndefined()
    })

    test("a value outside the allowed ones is a configuration error that withholds the resolved value and the click id", async () => {
      mocks.record.mockResolvedValue({ status: "invalidCustomerProperty" })
      mocks.getAll.mockResolvedValue(variableContext("VIP"))

      const result = await handleSendGoogleAdsConversionStep(
        props("whatsapp", { ...baseStep, customerType: "{{amount}}" }),
      )

      expect(result).toEqual({
        status: "error",
        result: null,
        errorMessage: "google_ads_invalid_customer_property",
      })
      const call = mocks.logProviderError.mock.calls[0]?.[0]
      expect(call.error.message).not.toContain("VIP")
      expect(call.error.message).toContain("[withheld]")
      expect(call.error.message).not.toContain(CLICK_ID)
    })
  })

  describe("event dedup (every run is its own conversion)", () => {
    const eventProps = (flowExecutionKey: string | undefined) =>
      ({
        ...props("whatsapp", { ...baseStep, dedupMode: "event" }),
        flowExecutionKey,
      }) as unknown as Parameters<typeof handleSendGoogleAdsConversionStep>[0]

    test("builds the occurrence key from the job id, the contact inbox and the step", async () => {
      await handleSendGoogleAdsConversionStep(eventProps("job-42"))

      expect(mocks.record.mock.calls[0]?.[0]).toMatchObject({
        dedupMode: "event",
        occurrenceKey: "flow:job-42:ci-1:step-1",
      })
    })

    test("the same job retried yields the same key", async () => {
      await handleSendGoogleAdsConversionStep(eventProps("job-42"))
      await handleSendGoogleAdsConversionStep(eventProps("job-42"))

      expect(mocks.record.mock.calls[0]?.[0].occurrenceKey).toBe(
        mocks.record.mock.calls[1]?.[0].occurrenceKey,
      )
    })

    test("a different job yields a different key", async () => {
      await handleSendGoogleAdsConversionStep(eventProps("job-42"))
      await handleSendGoogleAdsConversionStep(eventProps("job-43"))

      expect(mocks.record.mock.calls[0]?.[0].occurrenceKey).not.toBe(
        mocks.record.mock.calls[1]?.[0].occurrenceKey,
      )
    })

    test.each([
      "flow-inline-abc123",
      "integration-job-abc123",
      undefined,
    ])("passes no key when the run has no durable id (%s)", async (key) => {
      await handleSendGoogleAdsConversionStep(eventProps(key))

      expect(mocks.record.mock.calls[0]?.[0].occurrenceKey).toBeUndefined()
    })

    test("click and id modes never receive the key", async () => {
      await handleSendGoogleAdsConversionStep({
        ...props("whatsapp", { ...baseStep, dedupMode: "id", dedupId: "o-1" }),
        flowExecutionKey: "job-42",
      } as unknown as Parameters<typeof handleSendGoogleAdsConversionStep>[0])

      expect(mocks.record.mock.calls[0]?.[0].occurrenceKey).toBeUndefined()
    })
  })

  test("an unexpected failure returns a generic error and logs without the click id", async () => {
    // `record` already scrubs the click id; the handler must additionally log
    // a message string, never the raw error object.
    mocks.record.mockRejectedValue(new Error("boom [redacted]"))

    const result = await handleSendGoogleAdsConversionStep(props("whatsapp"))

    expect(result).toEqual({
      status: "error",
      result: null,
      errorMessage: "google_ads_record_failed",
    })
    expect(mocks.logProviderError).not.toHaveBeenCalled()
    const logged = JSON.stringify(mocks.loggerWarn.mock.calls[0]?.[0])
    expect(logged).not.toContain(CLICK_ID)
    const fields = mocks.loggerWarn.mock.calls[0]?.[0]
    expect(fields).not.toHaveProperty("err")
    expect(fields.reason).toBe("boom [redacted]")
  })
})
