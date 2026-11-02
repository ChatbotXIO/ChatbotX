import { beforeEach, describe, expect, test, vi } from "vitest"

// `startExternalStep` starts a flow at one node, through the same job builder
// the `startExternalNode` flow step uses. Only the boundaries are mocked.

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
  resolveStartTarget: vi.fn(),
  findActiveById: vi.fn(),
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
  contactCustomFieldService: {},
  conversationService: {
    findLatestCreatedByContact: (...args: unknown[]) =>
      mocks.findLatestCreatedByContact(...args),
  },
  flowService: {
    resolveStartTarget: (...args: unknown[]) =>
      mocks.resolveStartTarget(...args),
    findActiveById: (...args: unknown[]) => mocks.findActiveById(...args),
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

const conversation = {
  id: "conv-1",
  contactId: "contact-1",
  workspaceId: "ws-1",
}
const action = { type: "startExternalStep", flowId: "11", nodeId: "22" }

const run = (
  overrides: Record<string, unknown> = {},
  actionOverrides: Record<string, unknown> = {},
) =>
  new ActionExecutor().execute({
    action: { ...action, ...actionOverrides },
    contactId: "contact-1",
    workspaceId: "ws-1",
    source: { kind: "trigger", triggerId: "trigger-1" },
    ...overrides,
  })

describe("ActionExecutor startExternalStep", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findLatestCreatedByContact.mockResolvedValue(conversation)
    mocks.findMostRecentByContact.mockResolvedValue({ id: "ci-1" })
    mocks.resolveStartTarget.mockResolvedValue("ready")
  })

  test("enqueues a node-entry sendFlow job with the same shape as the flow step", async () => {
    const outcome = await run()

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.resolveStartTarget).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      flowId: "11",
      nodeId: "22",
    })
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd).toHaveBeenCalledWith("sendFlow", {
      type: "sendFlow",
      data: {
        conversationId: conversation,
        contactInboxId: "ci-1",
        flowId: "11",
        nodeId: "22",
        origin: "webhook",
      },
    })
    // Node entry: no step to resume from.
    expect(mocks.queueAdd.mock.calls[0]?.[1].data).not.toHaveProperty(
      "startFromStepId",
    )
  })

  test.each([
    ["flowNotFound"],
    ["flowInactive"],
    ["flowNotPublished"],
    ["nodeNotFound"],
  ])("a %s target is skipped with that reason and nothing is enqueued", async (status) => {
    mocks.resolveStartTarget.mockResolvedValue(status)

    expect(await run()).toEqual({ status: "skipped", reason: status })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test.each([
    ["a missing flow id", { flowId: undefined }],
    ["a missing node id", { nodeId: "" }],
    ["non-numeric ids", { flowId: "abc" }],
  ])("%s is an invalid action", async (_label, override) => {
    expect(await run({}, override)).toEqual({
      status: "skipped",
      reason: "invalidAction",
    })
    expect(mocks.resolveStartTarget).not.toHaveBeenCalled()
  })

  test("a contact without any inbox is skipped", async () => {
    mocks.findMostRecentByContact.mockResolvedValue(null)

    expect(await run()).toEqual({ status: "skipped", reason: "noContactInbox" })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a flow started by a Decision of the same flow is not restarted (self-loop)", async () => {
    const outcome = await run({ decisionFlowOrigin: { flowId: "11" } })

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("an inbound webhook retry reuses a deterministic job id", async () => {
    await run({
      source: { kind: "inboundWebhook", inboundWebhookId: "w-1" },
      occurrenceKey: "inboundWebhook:r-1:0",
    })

    expect(mocks.queueAdd.mock.calls[0]?.[2]).toEqual({
      jobId: "send-flow-inboundWebhook-r-1-0",
    })
  })

  test("a trigger run enqueues without a job id", async () => {
    await run({ occurrenceKey: "trigger:j-1:t-1:0" })

    expect(mocks.queueAdd.mock.calls[0]).toHaveLength(2)
  })
})

describe("ActionExecutor startAnotherFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findLatestCreatedByContact.mockResolvedValue(conversation)
    mocks.findMostRecentByContact.mockResolvedValue({ id: "ci-1" })
    mocks.findActiveById.mockResolvedValue({ id: "11", currentVersionId: "v1" })
  })

  const start = (overrides: Record<string, unknown> = {}) =>
    run(overrides, { type: "startAnotherFlow", nodeId: undefined })

  test("a flow started by a Decision of the same flow is not restarted (self-loop)", async () => {
    const outcome = await start({ decisionFlowOrigin: { flowId: "11" } })

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.findActiveById).not.toHaveBeenCalled()
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("a Decision of a different flow still starts the target flow", async () => {
    const outcome = await start({ decisionFlowOrigin: { flowId: "99" } })

    expect(outcome).toEqual({ status: "succeeded" })
    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
  })

  test("a contact without any inbox is skipped", async () => {
    mocks.findMostRecentByContact.mockResolvedValue(null)

    expect(await start()).toEqual({
      status: "skipped",
      reason: "noContactInbox",
    })
    expect(mocks.queueAdd).not.toHaveBeenCalled()
  })

  test("an inbound webhook with an occurrence key enqueues with a deterministic job id", async () => {
    await start({
      source: { kind: "inboundWebhook", inboundWebhookId: "w-1" },
      occurrenceKey: "inboundWebhook:r-1:2",
    })

    expect(mocks.queueAdd.mock.calls[0]?.[2]).toEqual({
      jobId: "send-flow-inboundWebhook-r-1-2",
    })
  })

  test("a trigger source enqueues without a job id", async () => {
    await start({ occurrenceKey: "trigger:j-1:t-1:0" })

    expect(mocks.queueAdd.mock.calls[0]).toHaveLength(2)
  })
})
