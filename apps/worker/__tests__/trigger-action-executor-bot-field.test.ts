import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the `setCustomField` / `clearCustomField` cases of `ActionExecutor`
// (apps/worker/src/trigger/services/action-executor.ts): the executor must
// dispatch on `parseFieldReference(action.customFieldId)` — a `bot_field:<id>`
// token routes to `botFieldService` (all 5 operations), while a plain numeric
// id keeps today's `contactCustomFieldService.setValues` /
// `deleteByCustomFieldId` behavior (only `set` persists; other operations
// stay a pre-existing silent no-op) untouched.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  setValues: vi.fn(),
  deleteByCustomFieldId: vi.fn(),
  applyValueOperation: vi.fn(),
  clearValueByKey: vi.fn(),
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
    setValues: (...args: unknown[]) => mocks.setValues(...args),
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

  test("setCustomField with a bot_field token routes to applyValueOperation with the action's operation", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: {
        type: "setCustomField",
        customFieldId: "bot_field:5",
        value: "9",
        operation: "O04",
      },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.applyValueOperation).toHaveBeenCalledTimes(1)
    expect(mocks.applyValueOperation).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      key: "5",
      operation: "O04",
      value: "9",
    })
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("setCustomField with a bot_field token defaults the operation to set when omitted", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: {
        type: "setCustomField",
        customFieldId: "bot_field:5",
        value: "9",
      },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.applyValueOperation).toHaveBeenCalledWith(
      expect.objectContaining({ key: "5", operation: "O01" }),
    )
  })

  test("setCustomField with a numeric customFieldId keeps calling setValues for the set operation", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: {
        type: "setCustomField",
        customFieldId: "42",
        value: "9",
        operation: "O01",
      },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.setValues).toHaveBeenCalledTimes(1)
    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "42", value: "9" }],
    })
    expect(mocks.applyValueOperation).not.toHaveBeenCalled()
  })

  test("setCustomField with a numeric customFieldId and a non-set operation stays a silent no-op (pre-existing behavior)", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: {
        type: "setCustomField",
        customFieldId: "42",
        value: "9",
        operation: "O04",
      },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.setValues).not.toHaveBeenCalled()
    expect(mocks.applyValueOperation).not.toHaveBeenCalled()
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
