import { beforeEach, describe, expect, test, vi } from "vitest"

// Each conversation-state action calls its service with workspace/contact/conversation attribution, then drops the scope's conversation snapshot.

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

const triggerContext = (handler: string) => ({
  triggerSource: "worker",
  triggerHandler: `actionExecutor.${handler}`,
  triggerType: "trigger_action",
})

describe("conversation-state trigger actions", () => {
  test.each([
    [
      "archiveConversation",
      {},
      () => mocks.updateArchived,
      { archivedAt: expect.any(Date) },
    ],
    [
      "unarchiveConversation",
      {},
      () => mocks.updateArchived,
      { archivedAt: null },
    ],
    [
      "unassignConversation",
      {},
      () => mocks.updateAssignment,
      { assignedUserId: null, assignedInboxTeamId: null },
    ],
    ["disableBot", {}, () => mocks.disableBotState, {}],
    ["enableBot", {}, () => mocks.enableBotState, {}],
    ["transferConversationToHuman", {}, () => mocks.disableBotState, {}],
  ])("%s calls its service for the conversation with trigger attribution", async (type, extra, service, expected) => {
    const outcome = await run({ type, ...extra })

    expect(outcome).toEqual({ status: "succeeded" })
    expect(service()).toHaveBeenCalledTimes(1)
    expect(service()).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversations: [conversation],
      triggerContext: triggerContext(type),
      ...expected,
    })
  })

  test("assignConversation assigns the configured assignee to the conversation", async () => {
    const outcome = await run({
      type: "assignConversation",
      assignedId: "u_user-1",
    })

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.assignOneOrSkip).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversation,
      assignedId: "u_user-1",
      triggerContext: triggerContext("assignConversation"),
    })
  })

  test.each([
    ["archiveConversation", {}],
    ["unarchiveConversation", {}],
    ["assignConversation", { assignedId: "u_user-1" }],
    ["unassignConversation", {}],
    ["disableBot", {}],
    ["enableBot", {}],
    ["transferConversationToHuman", {}],
  ])("%s invalidates the conversation snapshot before the next action", async (type, extra) => {
    const scope = createTriggerActionScope(identity)

    await run({ type, ...extra }, scope)
    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(1)
    await scope.getConversation()

    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(2)
  })

  test.each([
    ["archiveConversation", () => mocks.updateArchived],
    ["unassignConversation", () => mocks.updateAssignment],
    ["disableBot", () => mocks.disableBotState],
    ["enableBot", () => mocks.enableBotState],
    ["assignConversation", () => mocks.assignOneOrSkip],
  ])("a %s service failure rejects, still invalidates the snapshot and leaves later actions free to run", async (type, service) => {
    service().mockRejectedValueOnce(new Error("db down"))
    const scope = createTriggerActionScope(identity)

    await expect(run({ type, assignedId: "u_user-1" }, scope)).rejects.toThrow(
      "db down",
    )
    // The service may have written before it threw: the next read is fresh.
    await scope.getConversation()
    expect(mocks.findLatestCreatedByContact).toHaveBeenCalledTimes(2)

    // The failure is the executor's alone; the next action on the same scope runs.
    await expect(run({ type: "enableBot" }, scope)).resolves.toEqual({
      status: "succeeded",
    })
    expect(mocks.enableBotState).toHaveBeenCalledTimes(
      type === "enableBot" ? 2 : 1,
    )
  })

  test("transferConversationToHuman with notifyAdmins disables the bot exactly once", async () => {
    await run({ type: "transferConversationToHuman", notifyAdmins: true })

    expect(mocks.disableBotState).toHaveBeenCalledTimes(1)
    expect(mocks.enableBotState).not.toHaveBeenCalled()
  })

  test("without a conversation no conversation-state service is called", async () => {
    mocks.findLatestCreatedByContact.mockResolvedValue(undefined)

    expect(await run({ type: "archiveConversation" })).toEqual({
      status: "skipped",
      reason: "noConversation",
    })
    expect(mocks.updateArchived).not.toHaveBeenCalled()
  })
})
