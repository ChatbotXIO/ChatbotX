import { beforeEach, describe, expect, test, vi } from "vitest"

// Sequences of actions of one run share one scope: lookups are lazy and memoized.

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
  findActiveById: vi.fn(),
  setValueByKey: vi.fn(),
  deleteByCustomFieldId: vi.fn(),
  updateArchived: vi.fn(),
  updateAssignment: vi.fn(),
  assignOneOrSkip: vi.fn(),
  disableBotState: vi.fn(),
  enableBotState: vi.fn(),
  queueAdd: vi.fn(),
}))

// The trigger action registry imports the sequence actions, which reach
// `contactSequenceService` through its (non-barrel) subpath.
vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {},
}))

vi.mock("@chatbotx.io/business/pipeline", () => ({
  runPipelineAction: vi.fn(),
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
vi.mock("@chatbotx.io/business", () => ({
  adsConversionService: {},
  botFieldService: {},
  contactCustomFieldService: {
    setValueByKey: (...args: unknown[]) => mocks.setValueByKey(...args),
    deleteByCustomFieldId: (...args: unknown[]) =>
      mocks.deleteByCustomFieldId(...args),
  },
  conversationService: {
    findLatestCreatedByContact: (...args: unknown[]) =>
      mocks.findLatestCreatedByContact(...args),
    updateArchived: (...args: unknown[]) => mocks.updateArchived(...args),
    updateAssignment: (...args: unknown[]) => mocks.updateAssignment(...args),
    assignOneOrSkip: (...args: unknown[]) => mocks.assignOneOrSkip(...args),
    disableBotState: (...args: unknown[]) => mocks.disableBotState(...args),
    enableBotState: (...args: unknown[]) => mocks.enableBotState(...args),
  },
  flowService: {
    findActiveById: (...args: unknown[]) => mocks.findActiveById(...args),
    resolveStartTarget: vi.fn(),
  },
  tagService: {},
  tagSyncService: {},
  metaConversionsService: {},
  contactInboxService: {},
  googleAdsConversionService: {},
}))
vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))
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
vi.mock("@chatbotx.io/variables", () => ({
  resolveContactVariablesDeep: async (_contactId: string, value: unknown) =>
    value,
  contactVariableService: {},
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
  integrationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
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
const { createTriggerActionScope } = await import(
  "../src/trigger/services/actions/scope"
)

const conversation = {
  id: "conv-1",
  contactId: "contact-1",
  workspaceId: "ws-1",
}
const identity = { contactId: "contact-1", workspaceId: "ws-1" }

const run = (
  action: Record<string, unknown>,
  scope = createTriggerActionScope(identity),
) =>
  new ActionExecutor().execute(
    {
      action,
      contactId: "contact-1",
      workspaceId: "ws-1",
      source: { kind: "trigger", triggerId: "trigger-1" },
    },
    scope,
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findLatestCreatedByContact.mockResolvedValue(conversation)
  mocks.findMostRecentByContact.mockResolvedValue({ id: "ci-1" })
  mocks.findActiveById.mockResolvedValue({ id: "11", currentVersionId: "v1" })
})

describe("trigger action scope across a sequence of actions", () => {
  test("a sequence of field-only actions does no contact inbox lookup", async () => {
    const scope = createTriggerActionScope(identity)

    await run(
      { type: "setCustomField", customFieldId: "42", value: "a" },
      scope,
    )
    await run(
      { type: "setCustomField", customFieldId: "43", value: "b" },
      scope,
    )
    await run({ type: "clearCustomField", customFieldId: "44" }, scope)

    expect(mocks.findMostRecentByContact).not.toHaveBeenCalled()
    expect(mocks.findByIdForContact).not.toHaveBeenCalled()
    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(1)
  })

  test("several inbox-consuming actions do one inbox and one conversation lookup", async () => {
    const scope = createTriggerActionScope(identity)

    await run({ type: "startAnotherFlow", flowId: "11" }, scope)
    await run({ type: "startAnotherFlow", flowId: "12" }, scope)
    await run({ type: "startAnotherFlow", flowId: "13" }, scope)

    expect(mocks.queueAdd).toHaveBeenCalledTimes(3)
    expect(mocks.findMostRecentByContact).toHaveBeenCalledTimes(1)
    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(1)
  })

  test("a conversation-mutating action invalidates the snapshot so the next read re-queries", async () => {
    const scope = createTriggerActionScope(identity)

    await run(
      { type: "setCustomField", customFieldId: "42", value: "a" },
      scope,
    )
    await run({ type: "archiveConversation" }, scope)
    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(1)

    await run(
      { type: "setCustomField", customFieldId: "42", value: "b" },
      scope,
    )

    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(2)
  })

  test("a failed inbox lookup is retried by the next action, not cached as success", async () => {
    mocks.findMostRecentByContact
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce({ id: "ci-1" })
    const scope = createTriggerActionScope(identity)

    await expect(
      run({ type: "startAnotherFlow", flowId: "11" }, scope),
    ).rejects.toThrow("db down")
    await expect(
      run({ type: "startAnotherFlow", flowId: "11" }, scope),
    ).resolves.toEqual({ status: "succeeded" })

    expect(mocks.findMostRecentByContact).toHaveBeenCalledTimes(2)
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })
})
