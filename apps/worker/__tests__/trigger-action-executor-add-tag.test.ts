import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
  tagFindMany: vi.fn(),
  insertReturning: vi.fn(),
  enqueueAttach: vi.fn(),
  enqueueTagAppliedEvaluations: vi.fn(),
  enqueueEvent: vi.fn(),
  buildSourceKey: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      conversationModel: {
        findFirst: (...args: unknown[]) => mocks.conversationFindFirst(...args),
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
  conversationService: {},
  tagSyncService: {
    enqueueAttach: (...args: unknown[]) => mocks.enqueueAttach(...args),
  },
  adsConversionService: {
    enqueueTagAppliedEvaluations: (...args: unknown[]) =>
      mocks.enqueueTagAppliedEvaluations(...args),
  },
  metaConversionsService: {
    enqueueEvent: (...args: unknown[]) => mocks.enqueueEvent(...args),
    buildSourceKey: (...args: unknown[]) => mocks.buildSourceKey(...args),
  },
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

describe("ActionExecutor addTag", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.conversationFindFirst.mockResolvedValue({
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

  // Meta CAPI trigger-action coverage lives in
  // trigger-action-executor-send-meta-capi-event.test.ts — it needs its own
  // mocks for `@chatbotx.io/flow-config` (metaCapiEventFieldsSchema) and
  // `@chatbotx.io/variables` (resolveContactVariablesDeep).
})
