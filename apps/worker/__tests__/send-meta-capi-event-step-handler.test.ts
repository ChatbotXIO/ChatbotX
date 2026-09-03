import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

// Covers the flow-step handler `handleSendMetaCapiEventStep`
// (apps/worker/src/integration/handlers/meta-conversions/). It is the flow
// builder's entry into the Meta CAPI pipeline: it gates the channel, derives
// the workspace from the conversation, builds the deterministic per-step/day
// dedup `sourceKey`, resolves any `{{variable}}` templates in
// value/currency/contentIds, threads the full field set, and delegates
// to `metaConversionsService.enqueueEvent`. The trigger-action path has its
// own coverage (trigger-action-executor-send-meta-capi-event.test.ts); this
// is the parallel coverage for the flow-step path.
//
// `contactVariableService.getAll` (not `resolveContactVariablesDeep` itself)
// is mocked, via the sibling `contact-variable` module it's actually defined
// in — mocking `resolveContactVariablesDeep` directly would make it
// impossible to assert "no placeholder → getAll not called", since that is
// exactly the real resolver's short-circuit behavior under test.

const mocks = vi.hoisted(() => ({
  enqueueEvent: vi.fn(),
  buildSourceKey: vi.fn(() => "flow:step-1:ci-1:key"),
  getAll: vi.fn(),
  logProviderError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async () => {
  const actual = await vi.importActual<typeof import("@chatbotx.io/business")>(
    "@chatbotx.io/business",
  )
  return {
    ...actual,
    metaConversionsService: {
      enqueueEvent: mocks.enqueueEvent,
      buildSourceKey: mocks.buildSourceKey,
    },
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
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { handleSendMetaCapiEventStep } = await import(
  "../src/integration/handlers/meta-conversions/send-meta-capi-event-step-handler"
)

// Mirrors the business layer's `value` rule, so fixtures raise the same zod issue.
const plainNumberPattern = /^\d+(\.\d+)?$/

const baseStep = {
  id: "step-1",
  stepType: "sendMetaCapiEvent" as const,
  eventName: "LeadSubmitted" as const,
  actionSource: "business_messaging" as const,
  contentType: undefined,
  contentIds: undefined,
  value: undefined,
  currency: undefined,
  contentCategory: undefined,
  contentName: undefined,
}

function props(channel: string, step: typeof baseStep = baseStep) {
  return {
    contactInbox: { id: "ci-1", inboxId: "inbox-1", channel },
    conversation: { id: "conv-1", workspaceId: "ws-1", contactId: "contact-1" },
    step,
  } as unknown as Parameters<typeof handleSendMetaCapiEventStep>[0]
}

// Minimal `contactVariableService.getAll`-shaped fixture: enough for the real
// `replaceAll`/`customFieldResolver` to resolve `{{amount}}` to a custom
// field's value without hitting the database.
function variableContext(customFieldValue: string) {
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
    ]),
    botFieldsMap: new Map(),
    workspace: null,
  }
}

describe("handleSendMetaCapiEventStep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.buildSourceKey.mockReturnValue("flow:step-1:ci-1:key")
    mocks.enqueueEvent.mockResolvedValue({ id: "mce-1" })
  })

  test.each([
    "messenger",
    "instagram",
    "whatsapp",
  ])("enqueues a lead event for supported channel %s with a channel-aware source key", async (channel) => {
    const result = await handleSendMetaCapiEventStep(props(channel))

    expect(mocks.buildSourceKey).toHaveBeenCalledWith({
      scope: "flow",
      scopeId: "step-1",
      contactInboxId: "ci-1",
      channel,
      actionSource: "business_messaging",
    })
    expect(mocks.enqueueEvent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel,
      contactInboxId: "ci-1",
      inboxId: "inbox-1",
      source: "flowStep",
      sourceKey: "flow:step-1:ci-1:key",
      eventName: "LeadSubmitted",
      actionSource: "business_messaging",
      contentType: undefined,
      contentIds: undefined,
      value: undefined,
      currency: undefined,
      contentCategory: undefined,
      contentName: undefined,
    })
    expect(result).toEqual({ status: "success", result: null })
  })

  test("threads actionSource, contentType, contentIds, value, currency, and content fields to the enqueue", async () => {
    await handleSendMetaCapiEventStep(
      props("messenger", {
        ...baseStep,
        actionSource: "email" as const,
        contentType: "product" as const,
        contentIds: "sku-1,sku-2",
        value: "9.99",
        currency: "USD",
        contentCategory: "signup",
        contentName: "newsletter",
      }),
    )

    expect(mocks.getAll).not.toHaveBeenCalled()
    expect(mocks.enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actionSource: "email",
        contentType: "product",
        contentIds: "sku-1,sku-2",
        value: "9.99",
        currency: "USD",
        contentCategory: "signup",
        contentName: "newsletter",
      }),
    )
  })

  test("no placeholder in value/currency/contentIds never loads contact variables", async () => {
    await handleSendMetaCapiEventStep(
      props("messenger", { ...baseStep, value: "9.99", currency: "USD" }),
    )

    expect(mocks.getAll).not.toHaveBeenCalled()
    expect(mocks.enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({ value: "9.99", currency: "USD" }),
    )
  })

  test("resolves a {{variable}} template in value before enqueuing", async () => {
    mocks.getAll.mockResolvedValue(variableContext("9.99"))

    await handleSendMetaCapiEventStep(
      props("messenger", { ...baseStep, value: "{{amount}}", currency: "USD" }),
    )

    expect(mocks.getAll).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({ value: "9.99", currency: "USD" }),
    )
  })

  // The same zod rejection `metaConversionsService.enqueueEvent` raises when
  // a resolved template is not a plain number.
  const invalidValueError = () => {
    const result = z
      .object({
        value: z
          .string()
          .regex(
            plainNumberPattern,
            "Value must be a plain number such as 19.99",
          ),
      })
      .safeParse({ value: "abc" })
    if (result.success) {
      throw new Error("fixture must fail validation")
    }
    return result.error
  }

  test("an invalid resolved value returns an error state AND is recorded in the workspace Error Log", async () => {
    mocks.getAll.mockResolvedValue(variableContext("abc"))
    mocks.enqueueEvent.mockRejectedValueOnce(invalidValueError())

    const result = await handleSendMetaCapiEventStep(
      props("messenger", { ...baseStep, value: "{{amount}}", currency: "USD" }),
    )

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.errorMessage).toContain("Value must be a plain number")
      expect(result.errorMessage).not.toContain('"issues"')
    }

    expect(mocks.logProviderError).toHaveBeenCalledTimes(1)
    const [logged] = mocks.logProviderError.mock.calls[0] as [
      {
        provider: string
        workspaceId: string
        contactId: string
        error: Error
      },
    ]
    expect(logged).toMatchObject({
      provider: "meta-conversions",
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
    expect(logged.error.message).toContain("Value must be a plain number")
    // The Error Log entry names what the template actually resolved to.
    expect(logged.error.message).toContain('value="abc"')
    expect(logged.error.message).toContain('currency="USD"')
  })

  test("returns an error for an unsupported channel without enqueuing", async () => {
    const result = await handleSendMetaCapiEventStep(props("telegram"))

    expect(mocks.enqueueEvent).not.toHaveBeenCalled()
    expect(result.status).toBe("error")
  })

  test("a non-validation enqueue failure returns an error state without touching the Error Log", async () => {
    mocks.enqueueEvent.mockRejectedValueOnce(new Error("boom"))

    const result = await handleSendMetaCapiEventStep(props("messenger"))

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.errorMessage).toBe("boom")
    }
    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })
})
