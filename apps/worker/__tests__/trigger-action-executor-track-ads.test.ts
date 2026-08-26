import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  contactInboxFindFirst: vi.fn(),
  recordTriggerConversion: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      conversationModel: {
        findFirst: (...args: unknown[]) => mocks.conversationFindFirst(...args),
      },
      contactInboxModel: {
        findFirst: (...args: unknown[]) => mocks.contactInboxFindFirst(...args),
      },
    },
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: vi.fn() }),
      }),
    }),
    delete: () => ({ where: vi.fn() }),
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsToTagsModel: {
    contactId: "contactsToTagsModel.contactId",
    tagId: "contactsToTagsModel.tagId",
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: {},
  conversationService: {},
  tagSyncService: { enqueueAttach: vi.fn(), enqueueDetach: vi.fn() },
  adsConversionService: {
    enqueueTagAppliedEvaluations: vi.fn(),
    recordTriggerConversion: (...args: unknown[]) =>
      mocks.recordTriggerConversion(...args),
  },
  metaConversionsService: {
    enqueueLeadEvent: vi.fn(),
    buildLeadSourceKey: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))

vi.mock("@chatbotx.io/logger", () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
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

describe("ActionExecutor trackAdsLead / trackAdsPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.conversationFindFirst.mockResolvedValue({
      id: "conv-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
    mocks.contactInboxFindFirst.mockResolvedValue({
      id: "ci-1",
      inboxId: "inbox-1",
      contactId: "contact-1",
      channel: "whatsapp",
    })
    mocks.recordTriggerConversion.mockResolvedValue({
      id: "event-1",
      capiStatus: "pending",
    })
  })

  test("trackAdsLead calls recordTriggerConversion with eventType lead and no value/currency", async () => {
    const executor = new ActionExecutor()
    await executor.execute({
      action: { type: "trackAdsLead" },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.recordTriggerConversion).toHaveBeenCalledTimes(1)
    expect(mocks.recordTriggerConversion).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      triggerId: "trigger-1",
      eventType: "lead",
    })
  })

  test("trackAdsPurchase parses static value/currency config and forwards them", async () => {
    const executor = new ActionExecutor()
    await executor.execute({
      action: { type: "trackAdsPurchase", value: "19.99", currency: "USD" },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.recordTriggerConversion).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      triggerId: "trigger-1",
      eventType: "purchase",
      value: "19.99",
      currency: "USD",
    })
  })

  test("trackAdsPurchase without a configured value/currency forwards undefined for both", async () => {
    const executor = new ActionExecutor()
    await executor.execute({
      action: { type: "trackAdsPurchase" },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.recordTriggerConversion).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      triggerId: "trigger-1",
      eventType: "purchase",
      value: undefined,
      currency: undefined,
    })
  })

  test("trackAdsPurchase ignores non-string value/currency config (defensive parsing)", async () => {
    const executor = new ActionExecutor()
    await executor.execute({
      action: { type: "trackAdsPurchase", value: 19.99, currency: 42 },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.recordTriggerConversion).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInboxId: "ci-1",
      triggerId: "trigger-1",
      eventType: "purchase",
      value: undefined,
      currency: undefined,
    })
  })

  test("skips entirely when no conversation is found for the contact", async () => {
    mocks.conversationFindFirst.mockResolvedValue(null)

    const executor = new ActionExecutor()
    await executor.execute({
      action: { type: "trackAdsLead" },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.recordTriggerConversion).not.toHaveBeenCalled()
  })
})
