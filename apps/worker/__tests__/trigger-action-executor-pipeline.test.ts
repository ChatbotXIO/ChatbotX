import { beforeEach, describe, expect, test, vi } from "vitest"

// The trigger action "Pipelines" supplies the trigger actor, the occurrence key
// and the variable resolver to the business runner and maps its outcome.

const mocks = vi.hoisted(() => ({
  findLatestCreatedByContact: vi.fn(),
  runPipelineAction: vi.fn(),
  getAll: vi.fn(),
  replaceAll: vi.fn(),
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
  adsConversionService: {},
  botFieldService: {},
  contactCustomFieldService: {},
  conversationService: {
    findLatestCreatedByContact: (...args: unknown[]) =>
      mocks.findLatestCreatedByContact(...args),
  },
  flowService: {},
  tagService: {},
  tagSyncService: {},
  metaConversionsService: {},
  contactInboxService: {},
  googleAdsConversionService: {},
}))
// The trigger action registry imports the sequence actions, which reach
// `contactSequenceService` through its (non-barrel) subpath.
vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {},
}))

vi.mock("@chatbotx.io/business/pipeline", () => ({
  runPipelineAction: (...args: unknown[]) => mocks.runPipelineAction(...args),
}))
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: vi.fn(),
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
  resolveContactVariablesDeep: async (_contactId: string, value: unknown) =>
    value,
  contactVariableService: {
    getAll: (...args: unknown[]) => mocks.getAll(...args),
    replaceAll: (...args: unknown[]) => mocks.replaceAll(...args),
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

const conversation = {
  id: "conv-1",
  contactId: "contact-1",
  workspaceId: "ws-1",
}
const action = {
  type: "pipeline",
  pipelineId: "101",
  action: "changeTitle",
  title: "Deal {{name}}",
}

const run = (overrides: Record<string, unknown> = {}) =>
  new ActionExecutor().execute({
    action,
    contactId: "contact-1",
    workspaceId: "ws-1",
    source: { kind: "trigger", triggerId: "trigger-1" },
    occurrenceKey: "trigger:job-1:trigger-1:0",
    ...overrides,
  })

describe("ActionExecutor pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findLatestCreatedByContact.mockResolvedValue(conversation)
    mocks.runPipelineAction.mockResolvedValue({ status: "success" })
    mocks.getAll.mockResolvedValue({ name: "Ada" })
    mocks.replaceAll.mockImplementation(async ({ text }: { text: string }) =>
      text.replace("{{name}}", "Ada"),
    )
  })

  test("runs the action as the trigger with the occurrence key as dedup base", async () => {
    expect(await run()).toEqual({ status: "succeeded" })

    const [passedAction, ctx] = mocks.runPipelineAction.mock.calls[0] as [
      Record<string, unknown>,
      {
        actor: unknown
        baseIdempotencyKey: string
        workspaceId: string
        contactId: string
      },
    ]
    expect(passedAction).toMatchObject({
      action: "changeTitle",
      pipelineId: "101",
    })
    expect(ctx).toMatchObject({
      workspaceId: "ws-1",
      contactId: "contact-1",
      baseIdempotencyKey: "trigger:job-1:trigger-1:0",
      actor: { kind: "trigger", userId: null, sourceId: "trigger-1" },
    })
  })

  test("without an occurrence key dedup is off", async () => {
    await run({ occurrenceKey: undefined })

    expect(mocks.runPipelineAction.mock.calls[0]?.[1].baseIdempotencyKey).toBe(
      undefined,
    )
  })

  test("variables are loaded once and only when a field uses one", async () => {
    await run()
    const interpolate = mocks.runPipelineAction.mock.calls[0]?.[1].interpolate

    expect(mocks.getAll).not.toHaveBeenCalled()
    expect(await interpolate("plain")).toBe("plain")
    expect(await interpolate("Deal {{name}}")).toBe("Deal Ada")
    expect(await interpolate("Again {{name}}")).toBe("Again Ada")
    expect(mocks.getAll).toHaveBeenCalledTimes(1)
  })

  test("a skip carries its reason, an error a fixed one", async () => {
    mocks.runPipelineAction.mockResolvedValueOnce({
      status: "skip",
      message: "The contact has no open item in this pipeline",
    })
    expect(await run()).toEqual({
      status: "skipped",
      reason: "The contact has no open item in this pipeline",
    })

    mocks.runPipelineAction.mockResolvedValueOnce({
      status: "error",
      message: "detail for logs only",
    })
    expect(await run()).toEqual({ status: "skipped", reason: "pipelineError" })
  })

  test("an unexpected failure propagates so the caller can report it", async () => {
    mocks.runPipelineAction.mockRejectedValueOnce(new Error("db down"))

    await expect(run()).rejects.toThrow("db down")
  })

  test.each([
    ["a missing pipeline", { pipelineId: undefined }],
    ["an unknown pipeline action", { action: "nope" }],
    ["a malformed field", { title: 5 }],
  ])("%s is an invalid action", async (_label, override) => {
    const outcome = await run({ action: { ...action, ...override } })

    expect(outcome).toEqual({ status: "skipped", reason: "invalidAction" })
    expect(mocks.runPipelineAction).not.toHaveBeenCalled()
  })

  test("an inbound webhook cannot run it", async () => {
    const outcome = await run({
      source: { kind: "inboundWebhook", inboundWebhookId: "w-1" },
    })

    expect(outcome).toEqual({ status: "skipped", reason: "unsupportedSource" })
    expect(mocks.runPipelineAction).not.toHaveBeenCalled()
  })
})
