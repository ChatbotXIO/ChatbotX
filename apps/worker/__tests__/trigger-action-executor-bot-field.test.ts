import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the `setCustomField` / `clearCustomField` actions of `ActionExecutor`.
// `setCustomField` hands every field reference (bot field or contact field)
// and every operation to `contactCustomFieldService.setValueByKey`, which owns
// the dispatch; `clearCustomField` still dispatches on
// `parseFieldReference(action.customFieldId)`.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  setValueByKey: vi.fn(),
  deleteByCustomFieldId: vi.fn(),
  applyValueOperation: vi.fn(),
  clearValueByKey: vi.fn(),
}))

vi.mock("@chatbotx.io/business/pipeline", () => ({
  runPipelineAction: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  metaCapiEventChannelSchema: { safeParse: () => ({ success: false }) },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    findByIdForContact: vi.fn(),
    findMostRecentByContact: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {
    enqueueTagAppliedEvaluations: vi.fn(),
  },
  botFieldService: {
    applyValueOperation: (...args: unknown[]) =>
      mocks.applyValueOperation(...args),
    clearValueByKey: (...args: unknown[]) => mocks.clearValueByKey(...args),
  },
  contactCustomFieldService: {
    setValueByKey: (...args: unknown[]) => mocks.setValueByKey(...args),
    deleteByCustomFieldId: (...args: unknown[]) =>
      mocks.deleteByCustomFieldId(...args),
  },
  conversationService: {
    findLatestCreatedByContact: (...args: unknown[]) =>
      mocks.findLatestCreatedByContact(...args),
  },
  tagService: {},
  flowService: {},
  workspaceMemberService: {},
  inboxService: {},
  metaConversionsService: {
    enqueueEvent: vi.fn(),
    buildSourceKey: vi.fn(),
  },
  tagSyncService: { enqueueAttach: vi.fn(), enqueueDetach: vi.fn() },
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))

// `capi-input-error.ts` (imported transitively for the sendMetaCapiEvent
// branch) pulls `logProviderError` from this separate package subpath, which
// is not covered by the `@chatbotx.io/business` mock above (subpath exports
// are independent module specifiers). Left unmocked, it loads the real
// `@chatbotx.io/database/client` and relations graph against the partial
// schema mock below and crashes at import time.
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: vi.fn(),
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

// This suite exercises the trigger-action switch with placeholder-free
// actions only — no template resolution is under test here (see
// send-meta-capi-event-step-handler.test.ts / trigger-action-executor-send-
// meta-capi-event.test.ts for that). Mocked as a passthrough so importing
// action-executor.ts does not pull in `@chatbotx.io/variables`'s real
// dependency chain (contact/custom-field/business-subpath modules this file
// does not otherwise mock).
vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep: async (_contactId: string, value: unknown) =>
    value,
  contactVariableService: {
    getAll: vi.fn(async () => ({})),
    replaceAll: vi.fn(async ({ text }: { text: string }) =>
      text.replace("{{name}}", "Ada"),
    ),
  },
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

describe("ActionExecutor setCustomField / clearCustomField — field-reference dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findLatestCreatedByContact.mockResolvedValue({
      id: "conv-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
  })

  const setCustomField = (action: Record<string, unknown>, extra = {}) =>
    new ActionExecutor().execute({
      action: { type: "setCustomField", ...action },
      contactId: "contact-1",
      workspaceId: "ws-1",
      source: { kind: "trigger", triggerId: "trigger-1" },
      ...extra,
    })

  test("a bot_field token and its operation go through setValueByKey", async () => {
    const outcome = await setCustomField({
      customFieldId: "bot_field:5",
      value: "9",
      operation: "O04",
    })

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.setValueByKey).toHaveBeenCalledTimes(1)
    expect(mocks.setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        keyword: "bot_field:5",
        value: "9",
        operation: "O04",
        allowBotFields: true,
      }),
    )
    expect(mocks.applyValueOperation).not.toHaveBeenCalled()
  })

  test.each([
    undefined,
    "",
  ])("an omitted operation (%j) defaults to set", async (operation) => {
    await setCustomField({
      customFieldId: "bot_field:5",
      value: "9",
      operation,
    })

    expect(mocks.setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "bot_field:5", operation: "O01" }),
    )
  })

  test.each([
    ["an absent operation", { operation: undefined }],
    ["a blank operation", { operation: "" }],
  ])("a legacy action with %s and no value sets an empty value", async (_label, legacy) => {
    const outcome = await setCustomField({ customFieldId: "42", ...legacy })

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.setValueByKey).toHaveBeenCalledTimes(1)
    expect(mocks.setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "contact-1",
        keyword: "42",
        operation: "O01",
        value: "",
      }),
    )
  })

  test("a contact field applies every operation, not only set", async () => {
    await setCustomField({ customFieldId: "42", value: "9", operation: "O04" })

    expect(mocks.setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "42",
        value: "9",
        operation: "O04",
      }),
    )
  })

  test("the editor timezone and the threaded contact inbox are forwarded", async () => {
    await setCustomField(
      { customFieldId: "42", value: "2026-05-01", timezone: "Asia/Bangkok" },
      { contactInboxId: "ci-7" },
    )

    expect(mocks.setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceTimezoneOverride: "Asia/Bangkok",
        contactInboxId: "ci-7",
      }),
    )
  })

  test("{{variables}} in the value are resolved before the write", async () => {
    await setCustomField({ customFieldId: "42", value: "Hi {{name}}" })

    expect(mocks.setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({ value: "Hi Ada" }),
    )
  })

  test("a calculator rejection is reported as a skipped outcome", async () => {
    const { ChatbotXException } = await import("@chatbotx.io/business/errors")
    const rejection = new ChatbotXException(
      "rejected",
      "invalidFieldOperation",
      400,
    )
    rejection.data = { reason: "operandNotNumber" }
    mocks.setValueByKey.mockRejectedValueOnce(rejection)

    const outcome = await setCustomField({
      customFieldId: "42",
      value: "abc",
      operation: "O04",
    })

    expect(outcome).toEqual({
      status: "skipped",
      reason: "invalidFieldOperation:operandNotNumber",
    })
  })

  test("any other failure still throws", async () => {
    mocks.setValueByKey.mockRejectedValueOnce(new Error("db down"))

    await expect(
      setCustomField({ customFieldId: "42", value: "1" }),
    ).rejects.toThrow("db down")
  })

  test.each([
    ["a missing field id", { value: "1" }],
    ["an unknown operation code", { customFieldId: "42", operation: "O99" }],
    [
      "a formula without an expression",
      { customFieldId: "42", operation: "O07", value: "" },
    ],
  ])("%s is skipped as an invalid action", async (_label, action) => {
    const outcome = await setCustomField(action)

    expect(outcome).toEqual({ status: "skipped", reason: "invalidAction" })
    expect(mocks.setValueByKey).not.toHaveBeenCalled()
  })

  test("clearCustomField with a bot_field token routes to clearValueByKey", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: { type: "clearCustomField", customFieldId: "bot_field:5" },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.clearValueByKey).toHaveBeenCalledTimes(1)
    expect(mocks.clearValueByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      key: "5",
    })
    expect(mocks.deleteByCustomFieldId).not.toHaveBeenCalled()
  })

  test("clearCustomField with a numeric customFieldId keeps calling deleteByCustomFieldId", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: { type: "clearCustomField", customFieldId: "42" },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.deleteByCustomFieldId).toHaveBeenCalledTimes(1)
    expect(mocks.deleteByCustomFieldId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      customFieldId: "42",
    })
    expect(mocks.clearValueByKey).not.toHaveBeenCalled()
  })
})
