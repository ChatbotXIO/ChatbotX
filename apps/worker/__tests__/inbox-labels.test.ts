import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mutable state holders (controlled per test)
// ---------------------------------------------------------------------------
const state = {
  messengerIntegration: null as unknown,
  zaloIntegration: null as unknown,
  tagChannel: undefined as { id: string; tagId: string } | undefined,
  contactInboxes: [] as { id: string; contactId: string }[],
  ensureTagByNameResult: undefined as string | undefined,
  ensureTagChannelResult: undefined as string | undefined,
  linkTagToContactsReturningNewResult: [] as { contactId: string }[],
}

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/business — tagService, tagSyncService, messenger/zalo
// integration services
// ---------------------------------------------------------------------------
const linkTagToContactsReturningNew = vi.fn(
  async () => state.linkTagToContactsReturningNewResult,
)
const recordTagChannelAssignments = vi.fn(async () => undefined)
const deleteTagChannelAssignments = vi.fn(async () => undefined)
const detachTagFromContacts = vi.fn(async () => undefined)
const findTagChannel = vi.fn(async () => state.tagChannel)
const ensureTagByName = vi.fn(async () => state.ensureTagByNameResult)
const ensureTagChannel = vi.fn(async () => state.ensureTagChannelResult)
const enqueueDelete = vi.fn(async () => undefined)
const messengerFindByPageIdUnscoped = vi.fn(
  async () => state.messengerIntegration,
)
const zaloFindByOaId = vi.fn(async () => state.zaloIntegration)

vi.mock("@chatbotx.io/business", () => ({
  tagService: {
    linkTagToContactsReturningNew: (...args: unknown[]) =>
      linkTagToContactsReturningNew(...args),
    recordTagChannelAssignments: (...args: unknown[]) =>
      recordTagChannelAssignments(...args),
    deleteTagChannelAssignments: (...args: unknown[]) =>
      deleteTagChannelAssignments(...args),
    detachTagFromContacts: (...args: unknown[]) =>
      detachTagFromContacts(...args),
    findTagChannel: (...args: unknown[]) => findTagChannel(...args),
    ensureTagByName: (...args: unknown[]) => ensureTagByName(...args),
    ensureTagChannel: (...args: unknown[]) => ensureTagChannel(...args),
  },
  tagSyncService: { enqueueDelete },
  messengerIntegrationService: {
    findByPageIdUnscoped: (...args: unknown[]) =>
      messengerFindByPageIdUnscoped(...args),
  },
  zaloIntegrationService: {
    findByOaId: (...args: unknown[]) => zaloFindByOaId(...args),
  },
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/repositories
// ---------------------------------------------------------------------------
const listIdsByInboxAndSourceIds = vi.fn(async () => state.contactInboxes)
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactInboxRepository: {
    listIdsByInboxAndSourceIds: (...args: unknown[]) =>
      listIdsByInboxAndSourceIds(...args),
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { messenger: "messenger", zalo: "zalo" } },
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

const loggerWarn = logger.warn as ReturnType<typeof vi.fn>

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
  state.messengerIntegration = null
  state.zaloIntegration = null
  state.tagChannel = undefined
  state.contactInboxes = []
  state.ensureTagByNameResult = undefined
  state.ensureTagChannelResult = undefined
  state.linkTagToContactsReturningNewResult = []
  idCounter = 0

  vi.clearAllMocks()
  messengerFindByPageIdUnscoped.mockImplementation(
    async () => state.messengerIntegration,
  )
  zaloFindByOaId.mockImplementation(async () => state.zaloIntegration)
  findTagChannel.mockImplementation(async () => state.tagChannel)
  listIdsByInboxAndSourceIds.mockImplementation(
    async () => state.contactInboxes,
  )
  ensureTagByName.mockImplementation(async () => state.ensureTagByNameResult)
  ensureTagChannel.mockImplementation(async () => state.ensureTagChannelResult)
  linkTagToContactsReturningNew.mockImplementation(
    async () => state.linkTagToContactsReturningNewResult,
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
    expect(linkTagToContactsReturningNew).not.toHaveBeenCalled()
  })

  test("stops when integration is not found", async () => {
    state.messengerIntegration = null
    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )
    expect(linkTagToContactsReturningNew).not.toHaveBeenCalled()
    expect(loggerWarn).not.toHaveBeenCalled()
  })

  test("stops when tag sync is disabled", async () => {
    state.messengerIntegration = messengerIntegration({
      syncTagEnabledAt: null,
    })
    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )
    expect(linkTagToContactsReturningNew).not.toHaveBeenCalled()
  })

  test("warns on invalid payload", async () => {
    state.messengerIntegration = messengerIntegration()
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
    state.messengerIntegration = messengerIntegration()
  })

  test("add assigns + emits applied when the tag channel already exists", async () => {
    state.tagChannel = { id: "tc-1", tagId: "tag-1" }
    state.contactInboxes = [{ id: "ci-1", contactId: "c-1" }]
    state.linkTagToContactsReturningNewResult = [{ contactId: "c-1" }] // newly linked

    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )

    expect(linkTagToContactsReturningNew).toHaveBeenCalledWith({
      tagId: "tag-1",
      contactIds: ["c-1"],
    })
    expect(recordTagChannelAssignments).toHaveBeenCalledWith({
      tagId: "tag-1",
      tagChannelId: "tc-1",
      contactInboxIds: ["ci-1"],
    })
    expect(emitTagApplied).toHaveBeenCalledWith(WS_ID, "c-1", "tag-1", "ci-1")
  })

  test("add creates tag + channel from page_label_name, then assigns", async () => {
    state.tagChannel = undefined
    state.ensureTagByNameResult = "tag-new"
    state.ensureTagChannelResult = "tc-new"
    state.linkTagToContactsReturningNewResult = [{ contactId: "c-1" }]
    state.contactInboxes = [{ id: "ci-1", contactId: "c-1" }]

    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )

    expect(ensureTagByName).toHaveBeenCalledWith({
      workspaceId: WS_ID,
      name: LABEL_NAME,
    })
    expect(ensureTagChannel).toHaveBeenCalledWith({
      workspaceId: WS_ID,
      tagId: "tag-new",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: LABEL_ID,
    })
    expect(linkTagToContactsReturningNew).toHaveBeenCalledWith({
      tagId: "tag-new",
      contactIds: ["c-1"],
    })
    expect(recordTagChannelAssignments).toHaveBeenCalledWith({
      tagId: "tag-new",
      tagChannelId: "tc-new",
      contactInboxIds: ["ci-1"],
    })
  })

  test("add skips when tag is missing and no name in payload", async () => {
    state.tagChannel = undefined
    state.ensureTagByNameResult = undefined

    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        user: { id: PSID },
        label: { id: LABEL_ID }, // no page_label_name
      }),
    )

    // page_label_name defaults to "" -> ensureTagByName is never a valid create path
    expect(linkTagToContactsReturningNew).not.toHaveBeenCalled()
  })

  test("add without user is a no-op", async () => {
    await handleChannelLabelWebhook(
      messengerData({
        action: "add",
        label: { id: LABEL_ID, page_label_name: LABEL_NAME },
      }),
    )
    expect(linkTagToContactsReturningNew).not.toHaveBeenCalled()
  })

  test("remove unassigns: deletes channel mapping + contact tag + emits removed", async () => {
    state.tagChannel = { id: "tc-1", tagId: "tag-1" }
    state.contactInboxes = [{ id: "ci-1", contactId: "c-1" }]

    await handleChannelLabelWebhook(
      messengerData({
        action: "remove",
        user: { id: PSID },
        label: { id: LABEL_ID },
      }),
    )

    expect(deleteTagChannelAssignments).toHaveBeenCalledWith({
      tagChannelId: "tc-1",
      contactInboxIds: ["ci-1"],
    })
    expect(detachTagFromContacts).toHaveBeenCalledWith({
      tagId: "tag-1",
      contactIds: ["c-1"],
    })
    expect(emitTagRemoved).toHaveBeenCalledWith(WS_ID, "c-1", "tag-1", "ci-1")
  })

  test("remove without user is a no-op", async () => {
    await handleChannelLabelWebhook(
      messengerData({ action: "remove", label: { id: LABEL_ID } }),
    )
    expect(deleteTagChannelAssignments).not.toHaveBeenCalled()
  })

  test("unknown action is a no-op", async () => {
    await handleChannelLabelWebhook(
      messengerData({
        action: "rename",
        user: { id: PSID },
        label: { id: LABEL_ID },
      }),
    )
    expect(linkTagToContactsReturningNew).not.toHaveBeenCalled()
    expect(deleteTagChannelAssignments).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// Zalo
// ===========================================================================
describe("handleChannelLabelWebhook — zalo", () => {
  beforeEach(() => {
    state.zaloIntegration = zaloIntegration()
  })

  test("add_user_to_tag assigns the batch of users", async () => {
    state.tagChannel = { id: "tc-1", tagId: "tag-1" }
    state.contactInboxes = [
      { id: "ci-1", contactId: "c-1" },
      { id: "ci-2", contactId: "c-2" },
    ]
    state.linkTagToContactsReturningNewResult = [
      { contactId: "c-1" },
      { contactId: "c-2" },
    ]

    await handleChannelLabelWebhook(
      zaloData({
        event_name: "add_user_to_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME, user_ids: ["u-1", "u-2"] },
      }),
    )

    expect(linkTagToContactsReturningNew).toHaveBeenCalledWith({
      tagId: "tag-1",
      contactIds: ["c-1", "c-2"],
    })
    expect(recordTagChannelAssignments).toHaveBeenCalledWith({
      tagId: "tag-1",
      tagChannelId: "tc-1",
      contactInboxIds: ["ci-1", "ci-2"],
    })
  })

  test("add_user_to_tag with empty user_ids ensures the label only", async () => {
    state.tagChannel = undefined
    state.ensureTagByNameResult = "tag-new"
    state.ensureTagChannelResult = "tc-new"

    await handleChannelLabelWebhook(
      zaloData({
        event_name: "add_user_to_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME },
      }),
    )

    expect(ensureTagByName).toHaveBeenCalledWith({
      workspaceId: WS_ID,
      name: LABEL_NAME,
    })
    expect(ensureTagChannel).toHaveBeenCalledWith({
      workspaceId: WS_ID,
      tagId: "tag-new",
      channelType: "zalo",
      integrationId: "intg-zalo-1",
      externalLabelId: LABEL_NAME,
    })
    expect(linkTagToContactsReturningNew).not.toHaveBeenCalled()
  })

  test("remove_user_from_tag unassigns the batch", async () => {
    state.tagChannel = { id: "tc-1", tagId: "tag-1" }
    state.contactInboxes = [
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

    expect(deleteTagChannelAssignments).toHaveBeenCalledWith({
      tagChannelId: "tc-1",
      contactInboxIds: ["ci-1", "ci-2"],
    })
    expect(detachTagFromContacts).toHaveBeenCalledWith({
      tagId: "tag-1",
      contactIds: ["c-1", "c-2"],
    })
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
    expect(deleteTagChannelAssignments).not.toHaveBeenCalled()
  })

  test("remove_user_from_tag is a no-op when the tag channel is missing", async () => {
    state.tagChannel = undefined
    await handleChannelLabelWebhook(
      zaloData({
        event_name: "remove_user_from_tag",
        oa_id: OA_ID,
        tag: { name: LABEL_NAME, user_ids: ["u-1"] },
      }),
    )
    expect(deleteTagChannelAssignments).not.toHaveBeenCalled()
  })

  test("remove_tag enqueues a channel-scoped delete + keeps the workspace tag", async () => {
    state.tagChannel = { id: "tc-1", tagId: "tag-1" }

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
    expect(detachTagFromContacts).not.toHaveBeenCalled()
  })

  test("remove_tag is a no-op when the label is not mapped locally", async () => {
    state.tagChannel = undefined

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
