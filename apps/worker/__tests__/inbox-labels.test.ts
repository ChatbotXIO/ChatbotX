import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mutable state holders (controlled per test)
// ---------------------------------------------------------------------------
const queryResults = {
  integrationMessengerFindFirst: null as unknown,
  integrationZaloFindFirst: null as unknown,
  tagModelFindFirst: null as unknown,
  tagChannelFindFirst: null as unknown,
  contactInboxFindMany: [] as unknown[],
}
const insertReturning = { current: [] as unknown[] }

// ---------------------------------------------------------------------------
// DB mock — chainable builder
// ---------------------------------------------------------------------------
function makeChain(): Record<string, unknown> {
  const builder: Record<string, unknown> = {}
  const noop = () => builder
  builder.values = vi.fn(noop)
  builder.onConflictDoNothing = vi.fn(noop)
  builder.where = vi.fn(noop)
  builder.returning = vi.fn(async () => insertReturning.current)
  return builder
}
const insertChain = makeChain()
const deleteChain = makeChain()
;(deleteChain.where as ReturnType<typeof vi.fn>).mockImplementation(
  async () => undefined,
)

// Soft-delete path: db.update(tagModel).set().where().returning()
const updateReturning = { current: [] as unknown[] }
const updateChain: Record<string, unknown> = {}
updateChain.set = vi.fn(() => updateChain)
updateChain.where = vi.fn(() => updateChain)
updateChain.returning = vi.fn(async () => updateReturning.current)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      integrationMessengerModel: {
        findFirst: vi.fn(
          async () => queryResults.integrationMessengerFindFirst,
        ),
      },
      integrationZaloModel: {
        findFirst: vi.fn(async () => queryResults.integrationZaloFindFirst),
      },
      tagModel: {
        findFirst: vi.fn(async () => queryResults.tagModelFindFirst),
      },
      tagChannelModel: {
        findFirst: vi.fn(async () => queryResults.tagChannelFindFirst),
      },
      contactInboxModel: {
        findMany: vi.fn(async () => queryResults.contactInboxFindMany),
      },
    },
    insert: vi.fn(() => insertChain),
    delete: vi.fn(() => deleteChain),
    update: vi.fn(() => updateChain),
  },
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
  isNull: (...args: unknown[]) => args,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  tagModel: { id: "id", workspaceId: "workspaceId", name: "name" },
  tagChannelModel: {
    id: "id",
    tagId: "tagId",
    channelType: "channelType",
    integrationId: "integrationId",
    workspaceId: "workspaceId",
    externalLabelId: "externalLabelId",
  },
  contactsToTagsModel: { contactId: "contactId", tagId: "tagId" },
  contactToTagChannelModel: {
    tagId: "tagId",
    tagChannelId: "tagChannelId",
    contactInboxId: "contactInboxId",
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { messenger: "messenger", zalo: "zalo" } },
}))

const enqueueDelete = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/business", () => ({
  tagSyncService: { enqueueDelete },
}))

const invalidateCacheByTags = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags }))

const emitTagApplied = vi.fn(async () => undefined)
const emitTagRemoved = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/events", () => ({ emitTagApplied, emitTagRemoved }))

let idCounter = 0
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => `generated-${++idCounter}`) }
})

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Lazy imports AFTER mocks
// ---------------------------------------------------------------------------
const { handleChannelLabelWebhook } = await import(
  "../src/integration/handlers/inbox_labels"
)
const { logger } = await import("../src/lib/logger")
const { db } = await import("@chatbotx.io/database/client")
const {
  tagModel,
  tagChannelModel,
  contactsToTagsModel,
  contactToTagChannelModel,
} = await import("@chatbotx.io/database/schema")

const dbInsert = db.insert as ReturnType<typeof vi.fn>
const dbDelete = db.delete as ReturnType<typeof vi.fn>
const dbUpdate = db.update as ReturnType<typeof vi.fn>
const loggerWarn = logger.warn as ReturnType<typeof vi.fn>
const messengerFindFirst = db.query.integrationMessengerModel
  .findFirst as ReturnType<typeof vi.fn>
const zaloFindFirst = db.query.integrationZaloModel.findFirst as ReturnType<
  typeof vi.fn
>

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const PAGE_ID = "page-1"
const OA_ID = "oa-1"
const WS_ID = "ws-1"
const INBOX_ID = "inbox-1"
const LABEL_ID = "label-ext-1"
const LABEL_NAME = "VIP"
const PSID = "psid-1"

function messengerIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: "intg-msg-1",
    workspaceId: WS_ID,
    inboxId: INBOX_ID,
    pageId: PAGE_ID,
    syncTagEnabledAt: new Date("2026-01-01"),
    ...overrides,
  }
}
function zaloIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: "intg-zalo-1",
    workspaceId: WS_ID,
    inboxId: INBOX_ID,
    oaId: OA_ID,
    syncTagEnabledAt: new Date("2026-01-01"),
    ...overrides,
  }
}

function messengerPayload(value: Record<string, unknown>) {
  return {
    object: "page",
    entry: [
      {
        id: PAGE_ID,
        time: 1_700_000_000,
        changes: [{ field: "inbox_labels", value }],
      },
    ],
  }
}

function messengerData(value: Record<string, unknown>) {
  return {
    integrationType: "messenger" as const,
    integrationIdentifier: PAGE_ID,
    payload: messengerPayload(value),
  }
}
function zaloData(payload: unknown) {
  return {
    integrationType: "zalo" as const,
    integrationIdentifier: OA_ID,
    payload,
  }
}

beforeEach(() => {
  queryResults.integrationMessengerFindFirst = null
  queryResults.integrationZaloFindFirst = null
  queryResults.tagModelFindFirst = null
  queryResults.tagChannelFindFirst = null
  queryResults.contactInboxFindMany = []
  insertReturning.current = []
  updateReturning.current = []
  idCounter = 0

  vi.clearAllMocks()
  ;(insertChain.values as ReturnType<typeof vi.fn>).mockReturnValue(insertChain)
  ;(
    insertChain.onConflictDoNothing as ReturnType<typeof vi.fn>
  ).mockReturnValue(insertChain)
  ;(insertChain.returning as ReturnType<typeof vi.fn>).mockImplementation(
    async () => insertReturning.current,
  )
  ;(deleteChain.where as ReturnType<typeof vi.fn>).mockImplementation(
    async () => undefined,
  )
  ;(updateChain.set as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)
  ;(updateChain.where as ReturnType<typeof vi.fn>).mockReturnValue(updateChain)
  ;(updateChain.returning as ReturnType<typeof vi.fn>).mockImplementation(
    async () => updateReturning.current,
  )
  dbInsert.mockReturnValue(insertChain)
  dbDelete.mockReturnValue(deleteChain)
  dbUpdate.mockReturnValue(updateChain)
  messengerFindFirst.mockImplementation(
    async () => queryResults.integrationMessengerFindFirst,
  )
  zaloFindFirst.mockImplementation(
    async () => queryResults.integrationZaloFindFirst,
  )
})

// ===========================================================================
// Dispatch / guards
// ===========================================================================
describe("handleChannelLabelWebhook — dispatch", () => {
  test("warns and stops for an unsupported channel", async () => {
    await handleChannelLabelWebhook({
      // @ts-expect-error — testing an unsupported channel value
      integrationType: "telegram",
      integrationIdentifier: "x",
      payload: {},
    })

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "telegram" }),
      "inbox labels: unsupported channel",
    )
    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("stops when integration is not found", async () => {
    queryResults.integrationMessengerFindFirst = null
    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )
    expect(dbInsert).not.toHaveBeenCalled()
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  test("stops when tag sync is disabled", async () => {
    queryResults.integrationMessengerFindFirst = messengerIntegration({
      syncTagEnabledAt: null,
    })
    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )
    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("warns on invalid payload", async () => {
    queryResults.integrationMessengerFindFirst = messengerIntegration()
    await handleChannelLabelWebhook({
      integrationType: "messenger",
      integrationIdentifier: PAGE_ID,
      payload: { not: "a webhook" },
    })
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "messenger" }),
      "inbox labels: invalid payload",
    )
  })
})

// ===========================================================================
// Messenger
// ===========================================================================
describe("handleChannelLabelWebhook — messenger", () => {
  beforeEach(() => {
    queryResults.integrationMessengerFindFirst = messengerIntegration()
  })

  test("add assigns + emits applied when the tag channel already exists", async () => {
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }
    queryResults.contactInboxFindMany = [{ id: "ci-1", contactId: "c-1" }]
    insertReturning.current = [{ contactId: "c-1" }] // newly linked

    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )

    expect(dbInsert).toHaveBeenCalledWith(contactsToTagsModel)
    expect(dbInsert).toHaveBeenCalledWith(contactToTagChannelModel)
    expect(emitTagApplied).toHaveBeenCalledWith(WS_ID, "c-1", "tag-1", "ci-1")
  })

  test("add creates tag + channel from page_label_name, then assigns", async () => {
    queryResults.tagChannelFindFirst = null
    queryResults.tagModelFindFirst = null
    insertReturning.current = [{ id: "new-id" }]
    queryResults.contactInboxFindMany = [{ id: "ci-1", contactId: "c-1" }]

    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )

    expect(dbInsert).toHaveBeenCalledWith(tagModel)
    expect(dbInsert).toHaveBeenCalledWith(tagChannelModel)
    expect(dbInsert).toHaveBeenCalledWith(contactsToTagsModel)
    expect(dbInsert).toHaveBeenCalledWith(contactToTagChannelModel)
  })

  test("add skips when tag is missing and no name in payload", async () => {
    queryResults.tagChannelFindFirst = null
    queryResults.tagModelFindFirst = null

    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID }, // no page_label_name
      }),
    )

    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("add without user is a no-op", async () => {
    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )
    expect(dbInsert).not.toHaveBeenCalled()
  })

  test("remove unassigns: deletes channel mapping + contact tag + emits removed", async () => {
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }
    queryResults.contactInboxFindMany = [{ id: "ci-1", contactId: "c-1" }]

    await handleChannelLabelWebhook(
      messengerData({
        action: "remove",
        user: { id: PSID },
        label: { id: LABEL_ID },
      }),
    )

    expect(dbDelete).toHaveBeenCalledWith(contactToTagChannelModel)
    expect(dbDelete).toHaveBeenCalledWith(contactsToTagsModel)
    expect(emitTagRemoved).toHaveBeenCalledWith(WS_ID, "c-1", "tag-1", "ci-1")
  })

  test("remove without user is a no-op", async () => {
    await handleChannelLabelWebhook(
      messengerData({ action: "remove", label: { id: LABEL_ID } }),
    )
    expect(dbDelete).not.toHaveBeenCalled()
  })

  test("unknown action is a no-op", async () => {
    await handleChannelLabelWebhook(
      messengerData({
        action: "rename",
        user: { id: PSID },
        label: { id: LABEL_ID },
      }),
    )
    expect(dbInsert).not.toHaveBeenCalled()
    expect(dbDelete).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Zalo
// ===========================================================================
describe("handleChannelLabelWebhook — zalo", () => {
  beforeEach(() => {
    queryResults.integrationZaloFindFirst = zaloIntegration()
  })

  test("add_user_to_tag assigns the batch of users", async () => {
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }
    queryResults.contactInboxFindMany = [
      { id: "ci-1", contactId: "c-1" },
      { id: "ci-2", contactId: "c-2" },
    ]

    await handleChannelLabelWebhook(
      zaloData({
        event_name: "add_user_to_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME, user_ids: ["u-1", "u-2"] },
      }),
    )

    expect(dbInsert).toHaveBeenCalledWith(contactsToTagsModel)
    expect(dbInsert).toHaveBeenCalledWith(contactToTagChannelModel)
  })

  test("add_user_to_tag with empty user_ids ensures the label only", async () => {
    queryResults.tagChannelFindFirst = null
    queryResults.tagModelFindFirst = null
    insertReturning.current = [{ id: "new-id" }]

    await handleChannelLabelWebhook(
      zaloData({
        event_name: "add_user_to_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME },
      }),
    )

    expect(dbInsert).toHaveBeenCalledWith(tagModel)
    expect(dbInsert).toHaveBeenCalledWith(tagChannelModel)
    expect(dbInsert).not.toHaveBeenCalledWith(contactsToTagsModel)
  })

  test("remove_user_from_tag unassigns the batch", async () => {
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }
    queryResults.contactInboxFindMany = [
      { id: "ci-1", contactId: "c-1" },
      { id: "ci-2", contactId: "c-2" },
    ]

    await handleChannelLabelWebhook(
      zaloData({
        event_name: "remove_user_from_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME, user_ids: ["u-1", "u-2"] },
      }),
    )

    expect(dbDelete).toHaveBeenCalledWith(contactToTagChannelModel)
    expect(dbDelete).toHaveBeenCalledWith(contactsToTagsModel)
    expect(emitTagRemoved).toHaveBeenCalledTimes(2)
    // Each contact attributes to its OWN contactInbox from this label event,
    // not a shared/most-recent one across the batch.
    expect(emitTagRemoved).toHaveBeenCalledWith(WS_ID, "c-1", "tag-1", "ci-1")
    expect(emitTagRemoved).toHaveBeenCalledWith(WS_ID, "c-2", "tag-1", "ci-2")
  })

  test("remove_user_from_tag with empty user_ids is a no-op", async () => {
    await handleChannelLabelWebhook(
      zaloData({
        event_name: "remove_user_from_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME },
      }),
    )
    expect(dbDelete).not.toHaveBeenCalled()
  })

  test("remove_user_from_tag is a no-op when the tag channel is missing", async () => {
    queryResults.tagChannelFindFirst = null
    await handleChannelLabelWebhook(
      zaloData({
        event_name: "remove_user_from_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME, user_ids: ["u-1"] },
      }),
    )
    expect(dbDelete).not.toHaveBeenCalled()
  })

  test("remove_tag enqueues a channel-scoped delete + keeps the workspace tag", async () => {
    queryResults.tagChannelFindFirst = { id: "tc-1", tagId: "tag-1" }

    await handleChannelLabelWebhook(
      zaloData({
        event_name: "remove_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME },
      }),
    )

    expect(enqueueDelete).toHaveBeenCalledWith({
      workspaceId: WS_ID,
      tagId: "tag-1",
      channelType: "zalo",
      integrationId: "intg-zalo-1",
    })
    // No workspace-wide tag delete from the webhook.
    expect(dbUpdate).not.toHaveBeenCalled()
  })

  test("remove_tag is a no-op when the label is not mapped locally", async () => {
    queryResults.tagChannelFindFirst = null

    await handleChannelLabelWebhook(
      zaloData({
        event_name: "remove_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME },
      }),
    )

    expect(enqueueDelete).not.toHaveBeenCalled()
  })

  test("warns on invalid zalo payload", async () => {
    await handleChannelLabelWebhook(
      zaloData({
        event_name: "bogus",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME },
      }),
    )
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "zalo" }),
      "inbox labels: invalid payload",
    )
  })
})
