import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

// Covers the `sendMetaCapiEvent` trigger-action branch of `ActionExecutor`
// (apps/worker/src/trigger/services/action-executor.ts). Parallel coverage
// to the flow-step path (send-meta-capi-event-step-handler.test.ts): the
// trigger executor validates the stored action against the shared
// `metaCapiEventFieldsSchema` + the same cross-field refinements the flow
// step uses, resolves any `{{variable}}` templates (passing
// `contactInbox.id` — a string — because `getContactInbox()` returns a
// narrow `ContactInboxWorkspaceRow`, not a full model), then delegates to
// `metaConversionsService.enqueueEvent`.
//
// `@chatbotx.io/variables` is mocked directly (unlike
// send-meta-capi-event-step-handler.test.ts, which exercises the real
// resolver against `contactVariableService.getAll`): this suite otherwise
// hard-mocks `@chatbotx.io/business`/`@chatbotx.io/database/*` the same way
// every other `trigger-action-executor-*` suite does, and the real resolver
// chain reaches several `@chatbotx.io/business` subpath modules
// (`/contact-locale`, `/system-field`, `/workspace-lifecycle/predicates`)
// that would need a real (not hard-mocked) database schema to load. The
// template-substitution behavior itself is already covered end-to-end by
// the step-handler suite; this suite only asserts the executor forwards
// `resolveContactVariablesDeep`'s result to `enqueueEvent`.

// Mirrors the business layer's `value` rule, so fixtures raise the same zod issue.
const plainNumberPattern = /^\d+(\.\d+)?$/

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
  enqueueEvent: vi.fn(),
  buildSourceKey: vi.fn(),
  logProviderError: vi.fn(),
  resolveContactVariablesDeep: vi.fn(
    async (_contactId: string, value: unknown) => value,
  ),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  metaCapiEventChannelSchema: {
    safeParse: (value: unknown) =>
      value === "messenger" || value === "instagram" || value === "whatsapp"
        ? { success: true as const, data: value }
        : { success: false as const },
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findByIdForContact: (...args: unknown[]) =>
      mocks.findByIdForContact(...args),
    findMostRecentByContact: (...args: unknown[]) =>
      mocks.findMostRecentByContact(...args),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
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
  metaConversionsService: {
    enqueueEvent: (...args: unknown[]) => mocks.enqueueEvent(...args),
    buildSourceKey: (...args: unknown[]) => mocks.buildSourceKey(...args),
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

describe("ActionExecutor sendMetaCapiEvent", () => {
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
    mocks.findMostRecentByContact.mockResolvedValue({
      id: "ci-1",
      inboxId: "inbox-1",
      channel: "messenger",
    })
    mocks.buildSourceKey.mockReturnValue("trigger:trigger-1:ci-1:key")
  })

  test("happy path: enqueues the full field set with a channel-aware source key", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: {
        type: "sendMetaCapiEvent",
        eventName: "AddToCart",
        actionSource: "email",
        contentType: "product",
        contentIds: "sku-1,sku-2",
        value: "9.99",
        currency: "USD",
        contentCategory: "signup",
        contentName: "newsletter",
      },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.resolveContactVariablesDeep).toHaveBeenCalledWith(
      "contact-1",
      { value: "9.99", currency: "USD", contentIds: "sku-1,sku-2" },
      expect.objectContaining({ contactInbox: "ci-1" }),
    )
    expect(mocks.buildSourceKey).toHaveBeenCalledWith({
      scope: "trigger",
      scopeId: "trigger-1",
      contactInboxId: "ci-1",
      channel: "messenger",
      actionSource: "email",
    })
    expect(mocks.enqueueEvent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      contactInboxId: "ci-1",
      inboxId: "inbox-1",
      source: "triggerAction",
      sourceKey: "trigger:trigger-1:ci-1:key",
      eventName: "AddToCart",
      actionSource: "email",
      contentType: "product",
      contentIds: "sku-1,sku-2",
      value: "9.99",
      currency: "USD",
      contentCategory: "signup",
      contentName: "newsletter",
    })
  })

  test("forwards the resolved (post-template) value/currency/contentIds to the enqueue", async () => {
    mocks.resolveContactVariablesDeep.mockResolvedValue({
      value: "42.00",
      currency: "USD",
      contentIds: undefined,
    })

    const executor = new ActionExecutor()
    await executor.execute({
      action: {
        type: "sendMetaCapiEvent",
        eventName: "Purchase",
        actionSource: "business_messaging",
        value: "{{amount}}",
        currency: "USD",
      },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({ value: "42.00", currency: "USD" }),
    )
  })

  test("stored old-shape action (five fields, no actionSource) still enqueues LeadSubmitted/business_messaging", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: {
        type: "sendMetaCapiEvent",
        eventName: "LeadSubmitted",
        value: "9.99",
        currency: "USD",
        contentCategory: "signup",
        contentName: "newsletter",
      },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.enqueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "LeadSubmitted",
        actionSource: "business_messaging",
        value: "9.99",
        currency: "USD",
      }),
    )
  })

  test("unsupported channel warns and skips without enqueuing", async () => {
    mocks.findMostRecentByContact.mockResolvedValue({
      id: "ci-tg",
      inboxId: "inbox-tg",
      channel: "telegram",
    })

    const executor = new ActionExecutor()
    await expect(
      executor.execute({
        action: { type: "sendMetaCapiEvent" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.enqueueEvent).not.toHaveBeenCalled()
    expect(baseLogger.warn).toHaveBeenCalled()
  })

  test("invalid action (Purchase without value/currency) warns and skips without enqueuing", async () => {
    const executor = new ActionExecutor()
    await expect(
      executor.execute({
        action: { type: "sendMetaCapiEvent", eventName: "Purchase" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.enqueueEvent).not.toHaveBeenCalled()
    expect(mocks.resolveContactVariablesDeep).not.toHaveBeenCalled()
    expect(baseLogger.warn).toHaveBeenCalled()
    // A stored action the schema rejects is the workspace's configuration
    // problem, so it is surfaced in the Error Log, not only the worker log.
    expect(mocks.logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "meta-conversions",
        workspaceId: "ws-1",
        contactId: "contact-1",
      }),
    )
    const [logged] = mocks.logProviderError.mock.calls[0] as [{ error: Error }]
    expect(logged.error.message).toContain("Value is required for Purchase")
  })

  test("a resolved template the enqueue rejects is recorded in the Error Log and still fails the action", async () => {
    mocks.resolveContactVariablesDeep.mockResolvedValueOnce({
      value: "250Hung",
      currency: "VND",
      contentIds: undefined,
    })
    const validation = z
      .object({
        value: z
          .string()
          .regex(
            plainNumberPattern,
            "Value must be a plain number such as 19.99",
          ),
      })
      .safeParse({ value: "250Hung" })
    if (validation.success) {
      throw new Error("fixture must fail validation")
    }
    mocks.enqueueEvent.mockRejectedValueOnce(validation.error)

    const executor = new ActionExecutor()
    await expect(
      executor.execute({
        action: {
          type: "sendMetaCapiEvent",
          eventName: "Purchase",
          actionSource: "email",
          value: "250{{first_name}}",
          currency: "VND",
        },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toBe(validation.error)

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
    expect(logged.error.message).toContain('value="250Hung"')
  })

  test("a non-validation enqueue failure propagates without touching the Error Log", async () => {
    mocks.enqueueEvent.mockRejectedValueOnce(new Error("boom"))

    const executor = new ActionExecutor()
    await expect(
      executor.execute({
        action: { type: "sendMetaCapiEvent", eventName: "LeadSubmitted" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
      }),
    ).rejects.toThrow("boom")

    expect(mocks.logProviderError).not.toHaveBeenCalled()
  })
})
