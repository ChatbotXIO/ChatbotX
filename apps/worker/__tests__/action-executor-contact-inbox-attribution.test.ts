import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Regression coverage for the per-integration inbox attribution fix: the
// ActionExecutor must resolve the contact inbox via contactInboxRepository
// (never a raw db.query.contactInboxModel lookup), preferring a threaded
// contactInboxId over the contact's most-recently-active inbox, and only the
// 5 inbox-consuming branches (startAnotherFlow, sendMetaCapiEvent,
// trackAdsLead, trackAdsPurchase, runGoogleSheet) should ever call the
// resolver at all — the other 11 contact/conversation-scoped actions must run
// without paying for that query.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  conversationFindFirst: vi.fn(),
  tagFindMany: vi.fn(),
  flowFindFirst: vi.fn(),
  workspaceMemberFindFirst: vi.fn(),
  inboxTeamFindFirst: vi.fn(),
  findByIdForContact: vi.fn(),
  findMostRecentByContact: vi.fn(),
  insertReturning: vi.fn(),
  recordTriggerConversion: vi.fn(),
  enqueueLeadEvent: vi.fn(),
  buildLeadSourceKey: vi.fn(),
  setValues: vi.fn(),
  deleteByCustomFieldId: vi.fn(),
  updateArchived: vi.fn(),
  updateAssignment: vi.fn(),
  disableBotState: vi.fn(),
  enableBotState: vi.fn(),
  enqueueAttach: vi.fn(),
  enqueueDetach: vi.fn(),
  enqueueTagAppliedEvaluations: vi.fn(),
  integrationQueueAdd: vi.fn(),
  getSpreadsheetRow: vi.fn(),
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
      flowModel: {
        findFirst: (...args: unknown[]) => mocks.flowFindFirst(...args),
      },
      workspaceMemberModel: {
        findFirst: (...args: unknown[]) =>
          mocks.workspaceMemberFindFirst(...args),
      },
      inboxTeamModel: {
        findFirst: (...args: unknown[]) => mocks.inboxTeamFindFirst(...args),
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
  contactCustomFieldService: {
    setValues: (...args: unknown[]) => mocks.setValues(...args),
    deleteByCustomFieldId: (...args: unknown[]) =>
      mocks.deleteByCustomFieldId(...args),
  },
  conversationService: {
    updateArchived: (...args: unknown[]) => mocks.updateArchived(...args),
    updateAssignment: (...args: unknown[]) => mocks.updateAssignment(...args),
    disableBotState: (...args: unknown[]) => mocks.disableBotState(...args),
    enableBotState: (...args: unknown[]) => mocks.enableBotState(...args),
  },
  tagSyncService: {
    enqueueAttach: (...args: unknown[]) => mocks.enqueueAttach(...args),
    enqueueDetach: (...args: unknown[]) => mocks.enqueueDetach(...args),
  },
  adsConversionService: {
    enqueueTagAppliedEvaluations: (...args: unknown[]) =>
      mocks.enqueueTagAppliedEvaluations(...args),
    recordTriggerConversion: (...args: unknown[]) =>
      mocks.recordTriggerConversion(...args),
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
  integrationQueue: {
    add: (...args: unknown[]) => mocks.integrationQueueAdd(...args),
  },
}))

vi.mock("../src/integration/handlers/spreadsheet-handler", () => ({
  clearSpreadsheetRow: vi.fn(),
  getSpreadsheetRandomRow: vi.fn(),
  getSpreadsheetRow: (...args: unknown[]) => mocks.getSpreadsheetRow(...args),
  sendSpreadsheetData: vi.fn(),
  updateSpreadsheetRow: vi.fn(),
}))

const { ActionExecutor } = await import(
  "../src/trigger/services/action-executor"
)
const baseLogger = (await import("@chatbotx.io/logger")).default

const WHATSAPP_INBOX = {
  id: "ci-whatsapp",
  inboxId: "inbox-whatsapp",
  channel: "whatsapp",
}
const MESSENGER_INBOX = {
  id: "ci-messenger",
  inboxId: "inbox-messenger",
  channel: "messenger",
}

describe("ActionExecutor — per-integration contact inbox attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.conversationFindFirst.mockResolvedValue({
      id: "conv-1",
      contactId: "contact-1",
      workspaceId: "ws-1",
    })
  })

  describe("multi-integration repro — 4 consumers prefer the threaded contactInboxId over most-recent", () => {
    beforeEach(() => {
      // The contact's most-recently-active inbox is Messenger (newer), but
      // the trigger fired from a WhatsApp conversation — the threaded id
      // must win.
      mocks.findByIdForContact.mockResolvedValue(WHATSAPP_INBOX)
      mocks.findMostRecentByContact.mockResolvedValue(MESSENGER_INBOX)
      mocks.recordTriggerConversion.mockResolvedValue({
        id: "event-1",
        capiStatus: "pending",
      })
      mocks.buildLeadSourceKey.mockReturnValue("source-key")
      mocks.flowFindFirst.mockResolvedValue({
        id: "flow-1",
        currentVersionId: "fv-1",
      })
    })

    test("trackAdsLead records against the WhatsApp inbox, not the newer Messenger one", async () => {
      const executor = new ActionExecutor()
      await executor.execute({
        action: { type: "trackAdsLead" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
        contactInboxId: "ci-whatsapp",
      })

      expect(mocks.findByIdForContact).toHaveBeenCalledWith({
        id: "ci-whatsapp",
        contactId: "contact-1",
        workspaceId: "ws-1",
      })
      expect(mocks.findMostRecentByContact).not.toHaveBeenCalled()
      expect(mocks.recordTriggerConversion).toHaveBeenCalledWith(
        expect.objectContaining({ contactInboxId: "ci-whatsapp" }),
      )
    })

    test("trackAdsPurchase records against the WhatsApp inbox, not the newer Messenger one", async () => {
      const executor = new ActionExecutor()
      await executor.execute({
        action: { type: "trackAdsPurchase" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
        contactInboxId: "ci-whatsapp",
      })

      expect(mocks.recordTriggerConversion).toHaveBeenCalledWith(
        expect.objectContaining({ contactInboxId: "ci-whatsapp" }),
      )
    })

    test("sendMetaCapiEvent records against the WhatsApp inbox, not the newer Messenger one", async () => {
      const executor = new ActionExecutor()
      await executor.execute({
        action: { type: "sendMetaCapiEvent" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
        contactInboxId: "ci-whatsapp",
      })

      expect(mocks.enqueueLeadEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "whatsapp",
          contactInboxId: "ci-whatsapp",
          inboxId: "inbox-whatsapp",
        }),
      )
    })

    test("startAnotherFlow sends the flow to the WhatsApp inbox, not the newer Messenger one", async () => {
      const executor = new ActionExecutor()
      await executor.execute({
        action: { type: "startAnotherFlow", flowId: "flow-1" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
        contactInboxId: "ci-whatsapp",
      })

      expect(mocks.integrationQueueAdd).toHaveBeenCalledWith(
        "sendFlow",
        expect.objectContaining({
          data: expect.objectContaining({ contactInboxId: "ci-whatsapp" }),
        }),
      )
    })
  })

  describe("fallback — no threaded contactInboxId", () => {
    test("trackAdsLead falls back to the most-recently-active inbox", async () => {
      mocks.findMostRecentByContact.mockResolvedValue(WHATSAPP_INBOX)
      mocks.recordTriggerConversion.mockResolvedValue({
        id: "event-1",
        capiStatus: "pending",
      })

      const executor = new ActionExecutor()
      await executor.execute({
        action: { type: "trackAdsLead" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
      })

      expect(mocks.findByIdForContact).not.toHaveBeenCalled()
      expect(mocks.findMostRecentByContact).toHaveBeenCalledWith({
        contactId: "contact-1",
        workspaceId: "ws-1",
      })
      expect(mocks.recordTriggerConversion).toHaveBeenCalledWith(
        expect.objectContaining({ contactInboxId: "ci-whatsapp" }),
      )
    })
  })

  describe("stale/foreign threaded id falls back to most-recent", () => {
    test("trackAdsLead falls back when the threaded contactInboxId doesn't resolve for this contact/workspace", async () => {
      mocks.findByIdForContact.mockResolvedValue(null)
      mocks.findMostRecentByContact.mockResolvedValue(MESSENGER_INBOX)
      mocks.recordTriggerConversion.mockResolvedValue({
        id: "event-1",
        capiStatus: "pending",
      })

      const executor = new ActionExecutor()
      await executor.execute({
        action: { type: "trackAdsLead" },
        contactId: "contact-1",
        triggerId: "trigger-1",
        workspaceId: "ws-1",
        contactInboxId: "ci-stale",
      })

      expect(mocks.recordTriggerConversion).toHaveBeenCalledWith(
        expect.objectContaining({ contactInboxId: "ci-messenger" }),
      )
    })
  })

  describe("no inbox at all — the 5 inbox-consuming branches warn and skip", () => {
    beforeEach(() => {
      mocks.findMostRecentByContact.mockResolvedValue(null)
    })

    test.each([
      ["trackAdsLead", { type: "trackAdsLead" }],
      ["trackAdsPurchase", { type: "trackAdsPurchase" }],
      ["sendMetaCapiEvent", { type: "sendMetaCapiEvent" }],
      ["startAnotherFlow", { type: "startAnotherFlow", flowId: "flow-1" }],
      [
        "runGoogleSheet",
        {
          type: "runGoogleSheet",
          action: "spreadsheetGetRow",
          spreadsheetId: "sheet-1",
          sheetName: "Sheet1",
        },
      ],
    ])("%s warns and skips without throwing", async (_name, action) => {
      const executor = new ActionExecutor()
      await expect(
        executor.execute({
          action,
          contactId: "contact-1",
          triggerId: "trigger-1",
          workspaceId: "ws-1",
        }),
      ).resolves.toBeUndefined()

      expect(mocks.recordTriggerConversion).not.toHaveBeenCalled()
      expect(mocks.enqueueLeadEvent).not.toHaveBeenCalled()
      expect(mocks.integrationQueueAdd).not.toHaveBeenCalled()
      expect(mocks.getSpreadsheetRow).not.toHaveBeenCalled()
      expect(baseLogger.warn).toHaveBeenCalled()
    })
  })

  describe("no inbox at all — the 11 non-inbox actions still run, and the resolver is never called", () => {
    beforeEach(() => {
      // If any non-consuming branch accidentally called the resolver, this
      // would blow up the assertions below (resolver never called).
      mocks.findByIdForContact.mockRejectedValue(
        new Error("resolver should never be called for this branch"),
      )
      mocks.findMostRecentByContact.mockRejectedValue(
        new Error("resolver should never be called for this branch"),
      )
      mocks.tagFindMany.mockResolvedValue([{ id: "tag-1" }])
      mocks.insertReturning.mockResolvedValue([{ tagId: "tag-1" }])
      mocks.workspaceMemberFindFirst.mockResolvedValue({ id: "wm-1" })
      mocks.inboxTeamFindFirst.mockResolvedValue({ id: "it-1" })
    })

    test.each([
      ["addTag", { type: "addTag", tagIds: ["tag-1"] }],
      ["removeTag", { type: "removeTag", tagIds: ["tag-1"] }],
      [
        "setCustomField",
        { type: "setCustomField", customFieldId: "cf-1", value: "v" },
      ],
      ["clearCustomField", { type: "clearCustomField", customFieldId: "cf-1" }],
      ["archiveConversation", { type: "archiveConversation" }],
      ["unarchiveConversation", { type: "unarchiveConversation" }],
      [
        "assignConversation",
        { type: "assignConversation", assignedId: "u_user-1" },
      ],
      ["unassignConversation", { type: "unassignConversation" }],
      ["disableBot", { type: "disableBot" }],
      ["enableBot", { type: "enableBot" }],
      ["transferConversationToHuman", { type: "transferConversationToHuman" }],
    ])("%s runs without an inbox and never calls the resolver", async (_name, action) => {
      const executor = new ActionExecutor()
      await expect(
        executor.execute({
          action,
          contactId: "contact-1",
          triggerId: "trigger-1",
          workspaceId: "ws-1",
        }),
      ).resolves.toBeUndefined()

      expect(mocks.findByIdForContact).not.toHaveBeenCalled()
      expect(mocks.findMostRecentByContact).not.toHaveBeenCalled()
    })
  })
})
