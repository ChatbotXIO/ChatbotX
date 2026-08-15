import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  contactInboxFindFirst: vi.fn(),
  tagFindMany: vi.fn(),
  insertReturning: vi.fn(),
  enqueueAttach: vi.fn(),
  enqueueTagAppliedEvaluations: vi.fn(),
  enqueueLeadEvent: vi.fn(),
  buildLeadSourceKey: vi.fn(),
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
      tagModel: {
        findMany: (...args: unknown[]) => mocks.tagFindMany(...args),
      },
    },
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: (...args: unknown[]) => mocks.insertReturning(...args),
        }),
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
  tagSyncService: {
    enqueueAttach: (...args: unknown[]) => mocks.enqueueAttach(...args),
  },
  adsConversionService: {
    enqueueTagAppliedEvaluations: (...args: unknown[]) =>
      mocks.enqueueTagAppliedEvaluations(...args),
  },
  metaConversionsService: {
    enqueueLeadEvent: (...args: unknown[]) => mocks.enqueueLeadEvent(...args),
    buildLeadSourceKey: (...args: unknown[]) =>
      mocks.buildLeadSourceKey(...args),
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

describe("ActionExecutor addTag", () => {
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
      channel: "messenger",
    })
    mocks.buildLeadSourceKey.mockReturnValue("trigger:trigger-1:ci-1:key")
  })

  test("enqueues tag sync and ads conversion tagApplied evaluation for newly-linked tags", async () => {
    mocks.tagFindMany.mockResolvedValue([{ id: "tag-1" }, { id: "tag-2" }])
    mocks.insertReturning.mockResolvedValue([{ tagId: "tag-1" }])

    const executor = new ActionExecutor()
    await executor.execute({
      action: { type: "addTag", tagIds: ["tag-1", "tag-2"] },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.enqueueAttach).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })
    expect(mocks.enqueueTagAppliedEvaluations).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueTagAppliedEvaluations).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })
  })

  test("does not enqueue when no tags were newly linked", async () => {
    mocks.tagFindMany.mockResolvedValue([{ id: "tag-1" }])
    mocks.insertReturning.mockResolvedValue([])

    const executor = new ActionExecutor()
    await executor.execute({
      action: { type: "addTag", tagIds: ["tag-1"] },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.enqueueAttach).not.toHaveBeenCalled()
    expect(mocks.enqueueTagAppliedEvaluations).not.toHaveBeenCalled()
  })

  test("skips entirely when no conversation is found for the contact", async () => {
    mocks.conversationFindFirst.mockResolvedValue(null)

    const executor = new ActionExecutor()
    await executor.execute({
      action: { type: "addTag", tagIds: ["tag-1"] },
      contactId: "contact-1",
      workspaceId: "ws-1",
    })

    expect(mocks.tagFindMany).not.toHaveBeenCalled()
    expect(mocks.enqueueTagAppliedEvaluations).not.toHaveBeenCalled()
  })

  test("enqueues Meta CAPI trigger events with contact inbox source key and inbox id", async () => {
    const executor = new ActionExecutor()

    await executor.execute({
      action: { type: "sendMetaCapiEvent" },
      contactId: "contact-1",
      triggerId: "trigger-1",
      workspaceId: "ws-1",
    })

    expect(mocks.buildLeadSourceKey).toHaveBeenCalledWith({
      scope: "trigger",
      scopeId: "trigger-1",
      contactInboxId: "ci-1",
      channel: "messenger",
    })
    expect(mocks.enqueueLeadEvent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      contactInboxId: "ci-1",
      inboxId: "inbox-1",
      source: "triggerAction",
      sourceKey: "trigger:trigger-1:ci-1:key",
    })
  })
})
