import { beforeEach, describe, expect, test, vi } from "vitest"

const UNKNOWN_ACTION_RE = /unknown action/

// ---------------------------------------------------------------------------
// Repository / service mocks — the handler now calls repository + business
// service methods instead of `db.*` directly.
// ---------------------------------------------------------------------------

const queryResults = {
  tag: null as unknown,
  messengerIntegrations: [] as unknown[],
  zaloIntegrations: [] as unknown[],
  tagChannel: null as unknown,
  tagChannelList: [] as unknown[],
  messengerIntegration: null as unknown,
  zaloIntegration: null as unknown,
  contactInboxes: [] as unknown[],
  contactTagChannelRows: [] as unknown[],
  contactInboxIdsForChannelPage: [] as unknown[],
  contactIdsByIds: [] as unknown[],
  taggedContactIdsPage: [] as unknown[],
}

const tagServiceFindById = vi.fn(async () => queryResults.tag)
const tagServiceHardDeleteSoftDeleted = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn(async () => fakeCtx),
  tagService: {
    findById: (...args: unknown[]) => tagServiceFindById(...args),
    hardDeleteSoftDeleted: (...args: unknown[]) =>
      tagServiceHardDeleteSoftDeleted(...args),
  },
  zaloIntegrationService: {
    listByWorkspace: (...args: unknown[]) => zaloListByWorkspace(...args),
    findByInboxId: (...args: unknown[]) => zaloFindByInboxId(...args),
    findByIdUnscoped: (...args: unknown[]) => zaloFindByIdUnscoped(...args),
  },
}))

const zaloListByWorkspace = vi.fn(async () => queryResults.zaloIntegrations)
const zaloFindByInboxId = vi.fn(async () => queryResults.zaloIntegration)
const zaloFindByIdUnscoped = vi.fn(async () => queryResults.zaloIntegration)

const tagChannelInsertIfAbsent = vi.fn(async () => undefined)
const tagChannelFindByTagAndIntegration = vi.fn(
  async () => queryResults.tagChannel,
)
const tagChannelUpdateExternalLabelId = vi.fn(async () => undefined)
const tagChannelInsertOrFetch = vi.fn(async () => queryResults.tagChannel)
const tagChannelUpsertByTagAndIntegration = vi.fn(
  async () => queryResults.tagChannel,
)
const tagChannelLinkContactInbox = vi.fn(async () => undefined)
const tagChannelUnlinkContactInbox = vi.fn(async () => undefined)
const tagChannelListContactTagChannelRows = vi.fn(
  async () => queryResults.contactTagChannelRows,
)
const tagChannelListByTag = vi.fn(async () => queryResults.tagChannelList)
const tagChannelDeleteById = vi.fn(async () => undefined)
const tagChannelListContactInboxIdsForChannelPage = vi.fn(
  async () => queryResults.contactInboxIdsForChannelPage,
)
const tagChannelDeleteLinksForChannel = vi.fn(async () => undefined)
const tagChannelDeleteContactTagsForContacts = vi.fn(async () => undefined)
const tagChannelListTaggedContactIdsPage = vi.fn(
  async () => queryResults.taggedContactIdsPage,
)

const contactInboxListByContactId = vi.fn(
  async () => queryResults.contactInboxes,
)
const contactInboxListContactIdsByIds = vi.fn(
  async () => queryResults.contactIdsByIds,
)

const integrationMessengerListByWorkspace = vi.fn(
  async () => queryResults.messengerIntegrations,
)
const integrationMessengerFindByInboxId = vi.fn(
  async () => queryResults.messengerIntegration,
)
const integrationMessengerFindById = vi.fn(
  async () => queryResults.messengerIntegration,
)

vi.mock("@chatbotx.io/database/repositories", () => ({
  tagChannelRepository: {
    insertIfAbsent: (...args: unknown[]) => tagChannelInsertIfAbsent(...args),
    findByTagAndIntegration: (...args: unknown[]) =>
      tagChannelFindByTagAndIntegration(...args),
    updateExternalLabelId: (...args: unknown[]) =>
      tagChannelUpdateExternalLabelId(...args),
    insertOrFetch: (...args: unknown[]) => tagChannelInsertOrFetch(...args),
    upsertByTagAndIntegration: (...args: unknown[]) =>
      tagChannelUpsertByTagAndIntegration(...args),
    linkContactInbox: (...args: unknown[]) =>
      tagChannelLinkContactInbox(...args),
    unlinkContactInbox: (...args: unknown[]) =>
      tagChannelUnlinkContactInbox(...args),
    listContactTagChannelRows: (...args: unknown[]) =>
      tagChannelListContactTagChannelRows(...args),
    listByTag: (...args: unknown[]) => tagChannelListByTag(...args),
    deleteById: (...args: unknown[]) => tagChannelDeleteById(...args),
    listContactInboxIdsForChannelPage: (...args: unknown[]) =>
      tagChannelListContactInboxIdsForChannelPage(...args),
    deleteLinksForChannel: (...args: unknown[]) =>
      tagChannelDeleteLinksForChannel(...args),
    deleteContactTagsForContacts: (...args: unknown[]) =>
      tagChannelDeleteContactTagsForContacts(...args),
    listTaggedContactIdsPage: (...args: unknown[]) =>
      tagChannelListTaggedContactIdsPage(...args),
  },
  contactInboxRepository: {
    listByContactId: (...args: unknown[]) =>
      contactInboxListByContactId(...args),
    listContactIdsByIds: (...args: unknown[]) =>
      contactInboxListContactIdsByIds(...args),
  },
  integrationMessengerRepository: {
    listByWorkspace: (...args: unknown[]) =>
      integrationMessengerListByWorkspace(...args),
    findByInboxId: (...args: unknown[]) =>
      integrationMessengerFindByInboxId(...args),
    findById: (...args: unknown[]) => integrationMessengerFindById(...args),
  },
}))

// `chunkById` — single-chunk default: run the query once, invoke the
// callback if there are rows, then stop (mirrors the shared repo test
// helper pattern used elsewhere in this suite).
vi.mock("@chatbotx.io/database/utils", () => ({
  chunkById: async (
    queryBuilder: (lastId: string | null) => Promise<{ id: string }[]>,
    options: { callback: (rows: { id: string }[]) => Promise<unknown> },
  ) => {
    const rows = await queryBuilder(null)
    if (rows.length > 0) {
      await options.callback(rows)
    }
  },
}))

// ---------------------------------------------------------------------------
// Integration SDK mocks
// ---------------------------------------------------------------------------

const messengerRunChannelHandler = vi.fn(async () => ({ id: "label-ext-123" }))
vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: { runChannelHandler: messengerRunChannelHandler },
}))

const zaloRunAction = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/integration-zalo", () => ({
  integration: { runAction: zaloRunAction },
}))

// ---------------------------------------------------------------------------
// error-log — spy only, never throws
// ---------------------------------------------------------------------------

const logProviderError = vi.fn(async () => undefined)
const logProviderErrorForChannel = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: (...args: unknown[]) => logProviderError(...args),
  logProviderErrorForChannel: (...args: unknown[]) =>
    logProviderErrorForChannel(...args),
}))

// ---------------------------------------------------------------------------
// Redis distributedLock — execute fn immediately (no real lock)
// ---------------------------------------------------------------------------

const runExclusive = vi.fn(async ({ fn }: { fn: () => Promise<unknown> }) =>
  fn(),
)
vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive },
}))

// ---------------------------------------------------------------------------
// Business buildContext (shared fake ctx, re-used across mock factories above)
// ---------------------------------------------------------------------------

const fakeCtx = { _brand: "ctx" }

// ---------------------------------------------------------------------------
// Logger — silence / spy
// ---------------------------------------------------------------------------

vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Lazy import AFTER mocks are registered
// ---------------------------------------------------------------------------

const { handleSyncTag } = await import("../src/default/handlers/sync-tag")
const { logger } = await import("../src/lib/logger")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessengerIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: "intg-msg-1",
    workspaceId: "ws-1",
    inboxId: "inbox-msg-1",
    pageId: "page-123",
    syncTagEnabledAt: new Date("2026-01-01"),
    auth: { accessToken: "tok" },
    ...overrides,
  }
}

function makeZaloIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: "intg-zalo-1",
    workspaceId: "ws-1",
    inboxId: "inbox-zalo-1",
    syncTagEnabledAt: new Date("2026-01-01"),
    auth: { accessToken: "ztok" },
    ...overrides,
  }
}

function makeTagChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: "tc-1",
    workspaceId: "ws-1",
    tagId: "tag-1",
    channelType: "messenger",
    integrationId: "intg-msg-1",
    externalLabelId: "label-ext-123",
    ...overrides,
  }
}

function makeContactInbox(overrides: Record<string, unknown> = {}) {
  return {
    id: "ci-1",
    contactId: "contact-1",
    inboxId: "inbox-msg-1",
    channel: "messenger",
    sourceId: "psid-abc",
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Reset mutable state before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  queryResults.tag = null
  queryResults.messengerIntegrations = []
  queryResults.zaloIntegrations = []
  queryResults.tagChannel = null
  queryResults.tagChannelList = []
  queryResults.messengerIntegration = null
  queryResults.zaloIntegration = null
  queryResults.contactInboxes = []
  queryResults.contactTagChannelRows = []
  queryResults.contactInboxIdsForChannelPage = []
  queryResults.contactIdsByIds = []
  queryResults.taggedContactIdsPage = []

  vi.clearAllMocks()
})

// ===========================================================================
// dispatch router
// ===========================================================================

describe("handleSyncTag — dispatch", () => {
  test("unknown action logs warn and does not throw", async () => {
    await expect(
      handleSyncTag({
        action: "bogus" as never,
        workspaceId: "ws-1",
        tagId: "t1",
      }),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalledOnce()
    const [, msg] = (logger.warn as ReturnType<typeof vi.fn>).mock
      .calls[0] as unknown[]
    expect(msg).toMatch(UNKNOWN_ACTION_RE)
  })
})

// ===========================================================================
// syncTagCreate
// ===========================================================================

describe("syncTagCreate", () => {
  test("tag not found → early return, no SDK calls", async () => {
    queryResults.tag = null

    await handleSyncTag({
      action: "create",
      workspaceId: "ws-1",
      tagId: "missing-tag",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    expect(zaloRunAction).not.toHaveBeenCalled()
    expect(tagChannelInsertIfAbsent).not.toHaveBeenCalled()
  })

  test("messenger integration with syncTagEnabledAt=null is skipped", async () => {
    queryResults.tag = { id: "tag-1", name: "VIP" }
    queryResults.messengerIntegrations = [
      makeMessengerIntegration({ syncTagEnabledAt: null }),
    ]
    queryResults.zaloIntegrations = []

    await handleSyncTag({
      action: "create",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    expect(runExclusive).not.toHaveBeenCalled()
  })

  test("messenger sync-enabled → createLabel called under distributedLock with pageId and name", async () => {
    const tag = { id: "tag-1", name: "VIP" }
    const integration = makeMessengerIntegration()
    queryResults.tag = tag
    queryResults.messengerIntegrations = [integration]
    queryResults.zaloIntegrations = []
    queryResults.tagChannel = null // no existing tagChannel

    await handleSyncTag({
      action: "create",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    // distributedLock used with correct key
    expect(runExclusive).toHaveBeenCalledOnce()
    const lockCall = (runExclusive as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0]
    expect(lockCall.key).toBe(
      `tag-channel:messenger:${integration.id}:${tag.id}`,
    )
    expect(lockCall.timeoutInSeconds).toBe(30)

    // createLabel called with exact pageId and name
    expect(messengerRunChannelHandler).toHaveBeenCalledWith(
      "bot",
      "createLabel",
      expect.objectContaining({
        ctx: fakeCtx,
        data: { pageId: integration.pageId, name: tag.name },
      }),
    )
  })

  test("messenger sync-enabled, existing tagChannel → update externalLabelId (no insert)", async () => {
    const tag = { id: "tag-1", name: "VIP" }
    const integration = makeMessengerIntegration()
    const existing = makeTagChannel()
    queryResults.tag = tag
    queryResults.messengerIntegrations = [integration]
    queryResults.zaloIntegrations = []
    queryResults.tagChannel = existing

    messengerRunChannelHandler.mockResolvedValueOnce({ id: "label-new-456" })

    await handleSyncTag({
      action: "create",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(tagChannelUpdateExternalLabelId).toHaveBeenCalledWith({
      id: existing.id,
      externalLabelId: "label-new-456",
    })
    expect(tagChannelInsertIfAbsent).not.toHaveBeenCalled()
  })

  test("messenger createLabel failure is caught; warn logged; no throw", async () => {
    const tag = { id: "tag-1", name: "VIP" }
    queryResults.tag = tag
    queryResults.messengerIntegrations = [makeMessengerIntegration()]
    queryResults.zaloIntegrations = []
    // Make the lock fn throw (simulates createLabel failure propagating)
    runExclusive.mockRejectedValueOnce(new Error("FB 500"))

    await expect(
      handleSyncTag({ action: "create", workspaceId: "ws-1", tagId: "tag-1" }),
    ).resolves.toBeUndefined()

    expect(logger.warn).toHaveBeenCalled()
    expect(logProviderError).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "messenger", workspaceId: "ws-1" }),
    )
  })

  test("zalo sync-enabled → insertIfAbsent called with correct externalLabelId=tag.name", async () => {
    const tag = { id: "tag-1", name: "VIP" }
    const integration = makeZaloIntegration()
    queryResults.tag = tag
    queryResults.messengerIntegrations = []
    queryResults.zaloIntegrations = [integration]

    await handleSyncTag({
      action: "create",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(tagChannelInsertIfAbsent).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tagId: tag.id,
      channelType: "zalo",
      integrationId: integration.id,
      externalLabelId: tag.name,
    })
    // No real Zalo API called (no create-empty-tag API)
    expect(zaloRunAction).not.toHaveBeenCalled()
  })

  test("zalo sync disabled → skip insert", async () => {
    queryResults.tag = { id: "tag-1", name: "VIP" }
    queryResults.messengerIntegrations = []
    queryResults.zaloIntegrations = [
      makeZaloIntegration({ syncTagEnabledAt: null }),
    ]

    await handleSyncTag({
      action: "create",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(tagChannelInsertIfAbsent).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// syncTagAttach
// ===========================================================================

describe("syncTagAttach", () => {
  test("tag not found → early return, no SDK calls", async () => {
    queryResults.tag = null

    await handleSyncTag({
      action: "attach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "missing",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    expect(zaloRunAction).not.toHaveBeenCalled()
  })

  test("messenger channel — TagChannel already exists → skip createLabel, call assignLabel with exact labelId and sourceId", async () => {
    const tag = { id: "tag-1", name: "VIP", workspaceId: "ws-1" }
    const contactInbox = makeContactInbox()
    const integration = makeMessengerIntegration()
    const existingTagChannel = makeTagChannel({
      externalLabelId: "label-ext-123",
    })

    queryResults.tag = tag
    queryResults.contactInboxes = [contactInbox]
    queryResults.messengerIntegration = integration
    queryResults.tagChannel = existingTagChannel

    await handleSyncTag({
      action: "attach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    // createLabel must NOT be called (TagChannel already exists)
    expect(messengerRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "assignLabel",
      expect.objectContaining({
        ctx: fakeCtx,
        data: {
          labelId: existingTagChannel.externalLabelId,
          sourceId: contactInbox.sourceId,
        },
      }),
    )
    // createLabel not called
    const createLabelCalls = (
      messengerRunChannelHandler as ReturnType<typeof vi.fn>
    ).mock.calls.filter((c) => c[1] === "createLabel")
    expect(createLabelCalls).toHaveLength(0)
  })

  test("messenger channel — TagChannel does not exist → createLabel then insert then assignLabel", async () => {
    const tag = { id: "tag-1", name: "VIP", workspaceId: "ws-1" }
    const contactInbox = makeContactInbox()
    const integration = makeMessengerIntegration()
    const newTagChannel = makeTagChannel({ id: "tc-new" })

    queryResults.tag = tag
    queryResults.contactInboxes = [contactInbox]
    queryResults.messengerIntegration = integration
    queryResults.tagChannel = null
    tagChannelInsertOrFetch.mockResolvedValueOnce(newTagChannel)

    messengerRunChannelHandler.mockResolvedValueOnce({ id: "label-new-789" })

    await handleSyncTag({
      action: "attach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    const createLabelCall = (
      messengerRunChannelHandler as ReturnType<typeof vi.fn>
    ).mock.calls.find((c) => c[1] === "createLabel")
    expect(createLabelCall).toBeDefined()
    expect(createLabelCall?.[2]).toMatchObject({
      ctx: fakeCtx,
      data: { pageId: integration.pageId, name: tag.name },
    })

    const assignLabelCall = (
      messengerRunChannelHandler as ReturnType<typeof vi.fn>
    ).mock.calls.find((c) => c[1] === "assignLabel")
    expect(assignLabelCall).toBeDefined()
  })

  test("messenger integration with syncTagEnabledAt=null → skip entirely", async () => {
    const tag = { id: "tag-1", name: "VIP", workspaceId: "ws-1" }
    const contactInbox = makeContactInbox()

    queryResults.tag = tag
    queryResults.contactInboxes = [contactInbox]
    queryResults.messengerIntegration = makeMessengerIntegration({
      syncTagEnabledAt: null,
    })

    await handleSyncTag({
      action: "attach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
  })

  test("zalo channel — tagFollower called with correct userId and tagName", async () => {
    const tag = { id: "tag-1", name: "VIP", workspaceId: "ws-1" }
    const contactInbox = makeContactInbox({
      channel: "zalo",
      inboxId: "inbox-zalo-1",
      sourceId: "zalo-user-999",
    })
    const integration = makeZaloIntegration()
    const newTagChannel = makeTagChannel({
      id: "tc-zalo",
      channelType: "zalo",
      externalLabelId: "VIP",
    })

    queryResults.tag = tag
    queryResults.contactInboxes = [contactInbox]
    queryResults.zaloIntegration = integration
    tagChannelUpsertByTagAndIntegration.mockResolvedValueOnce(newTagChannel)

    await handleSyncTag({
      action: "attach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(zaloRunAction).toHaveBeenCalledWith(
      "tagFollower",
      expect.objectContaining({
        ctx: fakeCtx,
        userId: contactInbox.sourceId,
        tagName: tag.name,
      }),
    )
  })

  test("zalo channel — upsertByTagAndIntegration called with correct externalLabelId (tag.name)", async () => {
    const tag = { id: "tag-1", name: "VIP", workspaceId: "ws-1" }
    const contactInbox = makeContactInbox({
      channel: "zalo",
      inboxId: "inbox-zalo-1",
      sourceId: "zalo-user-999",
    })
    const integration = makeZaloIntegration()
    const tagChannel = makeTagChannel({
      id: "tc-zalo",
      channelType: "zalo",
      externalLabelId: "VIP",
    })

    queryResults.tag = tag
    queryResults.contactInboxes = [contactInbox]
    queryResults.zaloIntegration = integration
    tagChannelUpsertByTagAndIntegration.mockResolvedValueOnce(tagChannel)

    await handleSyncTag({
      action: "attach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(tagChannelUpsertByTagAndIntegration).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tagId: tag.id,
      channelType: "zalo",
      integrationId: integration.id,
      externalLabelId: tag.name,
    })
  })

  test("zalo integration with syncTagEnabledAt=null → skip tagFollower", async () => {
    const tag = { id: "tag-1", name: "VIP", workspaceId: "ws-1" }
    const contactInbox = makeContactInbox({
      channel: "zalo",
      inboxId: "inbox-zalo-1",
      sourceId: "zalo-user-999",
    })

    queryResults.tag = tag
    queryResults.contactInboxes = [contactInbox]
    queryResults.zaloIntegration = makeZaloIntegration({
      syncTagEnabledAt: null,
    })

    await handleSyncTag({
      action: "attach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(zaloRunAction).not.toHaveBeenCalled()
  })

  test("contactInbox not on messenger or zalo channel → no SDK calls", async () => {
    const tag = { id: "tag-1", name: "VIP", workspaceId: "ws-1" }
    queryResults.tag = tag
    queryResults.contactInboxes = [makeContactInbox({ channel: "webchat" })]

    await handleSyncTag({
      action: "attach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    expect(zaloRunAction).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// syncTagDetach
// ===========================================================================

describe("syncTagDetach", () => {
  test("messenger row — removeLabel called with correct labelId and sourceId", async () => {
    const row = {
      tagChannelId: "tc-1",
      contactInboxId: "ci-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-ext-123",
      sourceId: "psid-abc",
    }
    queryResults.contactTagChannelRows = [row]
    queryResults.messengerIntegration = makeMessengerIntegration()

    await handleSyncTag({
      action: "detach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).toHaveBeenCalledWith(
      "contact",
      "removeLabel",
      expect.objectContaining({
        ctx: fakeCtx,
        data: {
          labelId: row.externalLabelId,
          sourceId: row.sourceId,
        },
      }),
    )
  })

  test("zalo row — removeFollowerFromTag called with correct userId and tagName", async () => {
    const row = {
      tagChannelId: "tc-z1",
      contactInboxId: "ci-z1",
      channelType: "zalo",
      integrationId: "intg-zalo-1",
      externalLabelId: "VIP",
      sourceId: "zalo-user-777",
    }
    queryResults.contactTagChannelRows = [row]
    queryResults.zaloIntegration = makeZaloIntegration()

    await handleSyncTag({
      action: "detach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(zaloRunAction).toHaveBeenCalledWith(
      "removeFollowerFromTag",
      expect.objectContaining({
        ctx: fakeCtx,
        userId: row.sourceId,
        tagName: row.externalLabelId,
      }),
    )
  })

  test("local ContactToTagChannel row unlinked even when API call throws", async () => {
    const row = {
      tagChannelId: "tc-1",
      contactInboxId: "ci-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-ext-123",
      sourceId: "psid-abc",
    }
    queryResults.contactTagChannelRows = [row]
    queryResults.messengerIntegration = makeMessengerIntegration()

    // Make removeLabel throw
    messengerRunChannelHandler.mockRejectedValueOnce(new Error("FB offline"))

    await expect(
      handleSyncTag({
        action: "detach",
        workspaceId: "ws-1",
        contactId: "contact-1",
        tagId: "tag-1",
      }),
    ).resolves.toBeUndefined()

    // Local unlink still called
    expect(tagChannelUnlinkContactInbox).toHaveBeenCalledWith({
      tagChannelId: row.tagChannelId,
      contactInboxId: row.contactInboxId,
    })
    expect(logger.warn).toHaveBeenCalled()
    expect(logProviderErrorForChannel).toHaveBeenCalledWith(
      row.channelType,
      expect.objectContaining({ workspaceId: "ws-1", contactId: "contact-1" }),
    )
  })

  test("error isolation — first row API failure does not abort second row", async () => {
    const row1 = {
      tagChannelId: "tc-1",
      contactInboxId: "ci-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-1",
      sourceId: "psid-1",
    }
    const row2 = {
      tagChannelId: "tc-2",
      contactInboxId: "ci-2",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-2",
      sourceId: "psid-2",
    }
    queryResults.contactTagChannelRows = [row1, row2]
    queryResults.messengerIntegration = makeMessengerIntegration()

    // First API call fails, second should succeed
    messengerRunChannelHandler
      .mockRejectedValueOnce(new Error("FB timeout"))
      .mockResolvedValueOnce(undefined)

    await expect(
      handleSyncTag({
        action: "detach",
        workspaceId: "ws-1",
        contactId: "contact-1",
        tagId: "tag-1",
      }),
    ).resolves.toBeUndefined()

    // Both rows should have had unlink called (2 times)
    expect(tagChannelUnlinkContactInbox).toHaveBeenCalledTimes(2)
    // Second row's removeLabel was still attempted
    expect(messengerRunChannelHandler).toHaveBeenCalledTimes(2)
  })

  test("sync-disabled context (integration.syncTagEnabledAt=null) → no API call but local row still unlinked", async () => {
    const row = {
      tagChannelId: "tc-1",
      contactInboxId: "ci-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-ext-123",
      sourceId: "psid-abc",
    }
    queryResults.contactTagChannelRows = [row]
    // Sync disabled
    queryResults.messengerIntegration = makeMessengerIntegration({
      syncTagEnabledAt: null,
    })

    await handleSyncTag({
      action: "detach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    // Local unlink still runs
    expect(tagChannelUnlinkContactInbox).toHaveBeenCalled()
  })

  test("empty rows → no unlink, no API", async () => {
    queryResults.contactTagChannelRows = []

    await handleSyncTag({
      action: "detach",
      workspaceId: "ws-1",
      contactId: "contact-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    expect(zaloRunAction).not.toHaveBeenCalled()
    expect(tagChannelUnlinkContactInbox).not.toHaveBeenCalled()
  })
})

// ===========================================================================
// syncTagDelete
// ===========================================================================

describe("syncTagDelete", () => {
  test("messenger channel → label API NOT called (temporarily disabled), tag deleted", async () => {
    const channel = {
      id: "tc-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-ext-123",
    }
    queryResults.tagChannelList = [channel]
    queryResults.messengerIntegration = makeMessengerIntegration()

    await handleSyncTag({
      action: "delete",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    // tag row deleted
    expect(tagServiceHardDeleteSoftDeleted).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tagId: "tag-1",
    })
  })

  test("zalo channel → label API NOT called (temporarily disabled), tag deleted", async () => {
    const channel = {
      id: "tc-2",
      channelType: "zalo",
      integrationId: "intg-zalo-1",
      externalLabelId: "VIP",
    }
    queryResults.tagChannelList = [channel]
    queryResults.zaloIntegration = makeZaloIntegration()

    await handleSyncTag({
      action: "delete",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(zaloRunAction).not.toHaveBeenCalled()
    expect(tagServiceHardDeleteSoftDeleted).toHaveBeenCalled()
  })

  test("processes every channel then deletes the tag row", async () => {
    const ch1 = {
      id: "tc-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-1",
    }
    const ch2 = {
      id: "tc-2",
      channelType: "messenger",
      integrationId: "intg-msg-2",
      externalLabelId: "label-2",
    }
    queryResults.tagChannelList = [ch1, ch2]
    queryResults.messengerIntegration = makeMessengerIntegration()

    await expect(
      handleSyncTag({
        action: "delete",
        workspaceId: "ws-1",
        tagId: "tag-1",
      }),
    ).resolves.toBeUndefined()

    // Tag row delete still called
    expect(tagServiceHardDeleteSoftDeleted).toHaveBeenCalled()
    expect(tagChannelDeleteById).toHaveBeenCalledTimes(2)
  })

  test("sync-disabled context (syncTagEnabledAt=null) → skip API but still delete tag row", async () => {
    const channel = {
      id: "tc-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-ext-123",
    }
    queryResults.tagChannelList = [channel]
    queryResults.messengerIntegration = makeMessengerIntegration({
      syncTagEnabledAt: null,
    })

    await handleSyncTag({
      action: "delete",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    // Tag row still deleted
    expect(tagServiceHardDeleteSoftDeleted).toHaveBeenCalled()
  })

  test("no channels → only tag row deleted", async () => {
    queryResults.tagChannelList = []

    await handleSyncTag({
      action: "delete",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    expect(zaloRunAction).not.toHaveBeenCalled()
    expect(tagServiceHardDeleteSoftDeleted).toHaveBeenCalled()
  })

  test("multiple channels (messenger + zalo) → no API calls, tag deleted", async () => {
    const messengerChannel = {
      id: "tc-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
      externalLabelId: "label-ext-123",
    }
    const zaloChannel = {
      id: "tc-2",
      channelType: "zalo",
      integrationId: "intg-zalo-1",
      externalLabelId: "VIP",
    }
    queryResults.tagChannelList = [messengerChannel, zaloChannel]
    queryResults.messengerIntegration = makeMessengerIntegration()
    queryResults.zaloIntegration = makeZaloIntegration()

    await handleSyncTag({
      action: "delete",
      workspaceId: "ws-1",
      tagId: "tag-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    expect(zaloRunAction).not.toHaveBeenCalled()
    expect(tagServiceHardDeleteSoftDeleted).toHaveBeenCalled()
  })

  // ── channel-scoped delete (inbound webhook) ──────────────────────────────

  test("channel-scoped → deletes only this channel's rows + contacts, keeps Tag, no channel API", async () => {
    queryResults.tagChannelList = [makeTagChannel()] // id tc-1, messenger
    queryResults.contactInboxIdsForChannelPage = [{ contactInboxId: "ci-1" }]
    queryResults.contactIdsByIds = [{ contactId: "contact-1" }]

    await handleSyncTag({
      action: "delete",
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
    })

    // Inbound webhook: the channel already removed the label → no API call.
    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    // chunkById paged the channel's contact assignments
    expect(tagChannelListContactInboxIdsForChannelPage).toHaveBeenCalled()
    // per-channel + contact cleanup happens; the Tag row is NOT deleted
    // (workspace delete calls hardDeleteSoftDeleted; scoped delete does not).
    expect(tagChannelDeleteLinksForChannel).toHaveBeenCalledWith({
      tagChannelId: "tc-1",
      contactInboxIds: ["ci-1"],
    })
    expect(tagChannelDeleteContactTagsForContacts).toHaveBeenCalledWith({
      tagId: "tag-1",
      contactIds: ["contact-1"],
    })
    expect(tagChannelDeleteById).toHaveBeenCalledWith({ id: "tc-1" })
    expect(tagServiceHardDeleteSoftDeleted).not.toHaveBeenCalled()
  })

  test("channel-scoped → no-op when the tag is not mapped on that channel", async () => {
    queryResults.tagChannelList = []

    await handleSyncTag({
      action: "delete",
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "messenger",
      integrationId: "intg-msg-1",
    })

    expect(messengerRunChannelHandler).not.toHaveBeenCalled()
    expect(tagChannelDeleteById).not.toHaveBeenCalled()
    expect(tagServiceHardDeleteSoftDeleted).not.toHaveBeenCalled()
  })
})
