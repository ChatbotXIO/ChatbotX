import { beforeEach, describe, expect, test, vi } from "vitest"

// ── Repository / service spies ────────────────────────────────────────────────
const findTag = vi.fn()
const findManyMessengerIntegrations = vi.fn()
const findManyZaloIntegrations = vi.fn()
const findTagChannelByTagAndIntegration = vi.fn()
const findManyContactInboxes = vi.fn()
const findMessengerIntegrationByInboxId = vi.fn()
const findZaloIntegrationByInboxId = vi.fn()

// ── Mutation spies ────────────────────────────────────────────────────────────
const tagChannelInsertIfAbsent = vi.fn()
const tagChannelUpdateExternalLabelId = vi.fn()
const tagChannelInsertOrFetch = vi.fn()
const tagChannelUpsertByTagAndIntegration = vi.fn()
const tagChannelLinkContactInbox = vi.fn()

// ── Integration API spies ─────────────────────────────────────────────────────
const messengerCreateLabel = vi.fn()
const messengerAssignLabel = vi.fn()
const zaloTagFollower = vi.fn()
const zaloRunAction = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({ auth: {}, workspaceId: "ws-1" }),
  tagService: {
    findById: (...args: unknown[]) => findTag(...args),
  },
  zaloIntegrationService: {
    listByWorkspace: (...args: unknown[]) => findManyZaloIntegrations(...args),
    findByInboxId: (...args: unknown[]) =>
      findZaloIntegrationByInboxId(...args),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  tagChannelRepository: {
    insertIfAbsent: (...args: unknown[]) => tagChannelInsertIfAbsent(...args),
    findByTagAndIntegration: (...args: unknown[]) =>
      findTagChannelByTagAndIntegration(...args),
    updateExternalLabelId: (...args: unknown[]) =>
      tagChannelUpdateExternalLabelId(...args),
    insertOrFetch: (...args: unknown[]) => tagChannelInsertOrFetch(...args),
    upsertByTagAndIntegration: (...args: unknown[]) =>
      tagChannelUpsertByTagAndIntegration(...args),
    linkContactInbox: (...args: unknown[]) =>
      tagChannelLinkContactInbox(...args),
  },
  contactInboxRepository: {
    listByContactId: (...args: unknown[]) => findManyContactInboxes(...args),
  },
  integrationMessengerRepository: {
    listByWorkspace: (...args: unknown[]) =>
      findManyMessengerIntegrations(...args),
    findByInboxId: (...args: unknown[]) =>
      findMessengerIntegrationByInboxId(...args),
  },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: {
    runChannelHandler: (_group: unknown, name: unknown, ...args: unknown[]) => {
      if (name === "createLabel") {
        return messengerCreateLabel(...args)
      }
      if (name === "assignLabel") {
        return messengerAssignLabel(...args)
      }
      return Promise.resolve()
    },
  },
}))

vi.mock("@chatbotx.io/integration-zalo", () => ({
  integration: {
    runAction: (name: unknown, ...args: unknown[]) => {
      if (name === "tagFollower") {
        return zaloTagFollower(...args)
      }
      return zaloRunAction(name, ...args)
    },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: vi.fn(({ fn }: { fn: () => Promise<unknown> }) => fn()),
  },
}))

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: vi.fn(),
  logProviderErrorForChannel: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { handleSyncTag } = await import("../src/default/handlers/sync-tag")

const WS = "ws-1"
const TAG_ID = "tag-42"
const INTEGRATION_ID = "int-1"
const TAG = { id: TAG_ID, name: "VIP" }
const MESSENGER_INTEGRATION = {
  id: INTEGRATION_ID,
  inboxId: "inbox-1",
  pageId: "page-1",
  syncTagEnabledAt: new Date(),
  workspaceId: WS,
  auth: {},
}
const ZALO_INTEGRATION = {
  id: "zalo-int-1",
  inboxId: "zalo-inbox-1",
  syncTagEnabledAt: new Date(),
  workspaceId: WS,
  auth: {},
}
const TAG_CHANNEL = {
  id: "tc-1",
  externalLabelId: "fb-label-123",
  tagId: TAG_ID,
  workspaceId: WS,
  channelType: "messenger",
  integrationId: INTEGRATION_ID,
}
const MESSENGER_CONTACT_INBOX = {
  id: "ci-1",
  contactId: "contact-1",
  inboxId: "inbox-1",
  channel: "messenger",
  sourceId: "psid-1",
}
const ZALO_CONTACT_INBOX = {
  id: "ci-2",
  contactId: "contact-1",
  inboxId: "zalo-inbox-1",
  channel: "zalo",
  sourceId: "zalo-uid-1",
}

beforeEach(() => {
  findTag.mockReset()
  findManyMessengerIntegrations.mockReset()
  findManyZaloIntegrations.mockReset()
  findTagChannelByTagAndIntegration.mockReset()
  findManyContactInboxes.mockReset()
  findMessengerIntegrationByInboxId.mockReset()
  findZaloIntegrationByInboxId.mockReset()
  tagChannelInsertIfAbsent.mockReset()
  tagChannelUpdateExternalLabelId.mockReset()
  tagChannelInsertOrFetch.mockReset()
  tagChannelUpsertByTagAndIntegration.mockReset()
  tagChannelLinkContactInbox.mockReset()
  messengerCreateLabel.mockReset()
  messengerAssignLabel.mockReset()
  zaloTagFollower.mockReset()
  zaloRunAction.mockReset()

  findManyMessengerIntegrations.mockResolvedValue([])
  findManyZaloIntegrations.mockResolvedValue([])
  messengerCreateLabel.mockResolvedValue({ id: "fb-label-123", name: "VIP" })
  messengerAssignLabel.mockResolvedValue(undefined)
  zaloTagFollower.mockResolvedValue(undefined)
  tagChannelInsertIfAbsent.mockResolvedValue(undefined)
  tagChannelUpdateExternalLabelId.mockResolvedValue(undefined)
  tagChannelInsertOrFetch.mockResolvedValue(TAG_CHANNEL)
  tagChannelUpsertByTagAndIntegration.mockResolvedValue(TAG_CHANNEL)
  tagChannelLinkContactInbox.mockResolvedValue(undefined)
})

// ── syncTagCreate / createMessengerLabel ──────────────────────────────────────
describe("syncTagCreate — Messenger (createMessengerLabel)", () => {
  const runCreate = () =>
    handleSyncTag({ action: "create", workspaceId: WS, tagId: TAG_ID })

  test("always calls createLabel API regardless of existing TagChannel", async () => {
    findTag.mockResolvedValue(TAG)
    findManyMessengerIntegrations.mockResolvedValue([MESSENGER_INTEGRATION])
    findTagChannelByTagAndIntegration.mockResolvedValue(TAG_CHANNEL)

    await runCreate()

    expect(messengerCreateLabel).toHaveBeenCalledTimes(1)
  })

  test("when TagChannel exists: updates externalLabelId, does NOT insert", async () => {
    findTag.mockResolvedValue(TAG)
    findManyMessengerIntegrations.mockResolvedValue([MESSENGER_INTEGRATION])
    findTagChannelByTagAndIntegration.mockResolvedValue(TAG_CHANNEL)
    messengerCreateLabel.mockResolvedValue({ id: "new-fb-label", name: "VIP" })

    await runCreate()

    expect(tagChannelUpdateExternalLabelId).toHaveBeenCalledWith(
      expect.objectContaining({
        id: TAG_CHANNEL.id,
        externalLabelId: "new-fb-label",
      }),
    )
    expect(tagChannelInsertIfAbsent).not.toHaveBeenCalled()
  })

  test("when TagChannel does not exist: inserts new row, does NOT update", async () => {
    findTag.mockResolvedValue(TAG)
    findManyMessengerIntegrations.mockResolvedValue([MESSENGER_INTEGRATION])
    findTagChannelByTagAndIntegration.mockResolvedValue(null)

    await runCreate()

    expect(tagChannelInsertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        tagId: TAG_ID,
        externalLabelId: "fb-label-123",
        channelType: "messenger",
        integrationId: INTEGRATION_ID,
      }),
    )
    expect(tagChannelUpdateExternalLabelId).not.toHaveBeenCalled()
  })

  test("skips integration with syncTagEnabledAt = null", async () => {
    findTag.mockResolvedValue(TAG)
    findManyMessengerIntegrations.mockResolvedValue([
      { ...MESSENGER_INTEGRATION, syncTagEnabledAt: null },
    ])

    await runCreate()

    expect(messengerCreateLabel).not.toHaveBeenCalled()
  })

  test("returns early when tag not found", async () => {
    findTag.mockResolvedValue(null)

    await runCreate()

    expect(messengerCreateLabel).not.toHaveBeenCalled()
    expect(findManyMessengerIntegrations).not.toHaveBeenCalled()
  })

  test("continues to next integration when one throws", async () => {
    const INT_2 = { ...MESSENGER_INTEGRATION, id: "int-2" }
    findTag.mockResolvedValue(TAG)
    findManyMessengerIntegrations.mockResolvedValue([
      MESSENGER_INTEGRATION,
      INT_2,
    ])
    findTagChannelByTagAndIntegration.mockResolvedValue(null)
    messengerCreateLabel
      .mockRejectedValueOnce(new Error("Facebook API error"))
      .mockResolvedValueOnce({ id: "fb-2", name: "VIP" })

    await runCreate()

    expect(messengerCreateLabel).toHaveBeenCalledTimes(2)
  })

  test("calls createLabel once per enabled integration", async () => {
    const INT_2 = { ...MESSENGER_INTEGRATION, id: "int-2" }
    findTag.mockResolvedValue(TAG)
    findManyMessengerIntegrations.mockResolvedValue([
      MESSENGER_INTEGRATION,
      INT_2,
    ])
    findTagChannelByTagAndIntegration.mockResolvedValue(null)

    await runCreate()

    expect(messengerCreateLabel).toHaveBeenCalledTimes(2)
  })
})

// ── syncTagCreate — Zalo ──────────────────────────────────────────────────────
describe("syncTagCreate — Zalo (no API, insert tagChannel mapping)", () => {
  const runCreate = () =>
    handleSyncTag({ action: "create", workspaceId: WS, tagId: TAG_ID })

  test("inserts tagChannelModel for Zalo using tag name as externalLabelId", async () => {
    findTag.mockResolvedValue(TAG)
    findManyZaloIntegrations.mockResolvedValue([ZALO_INTEGRATION])

    await runCreate()

    expect(tagChannelInsertIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        tagId: TAG_ID,
        channelType: "zalo",
        integrationId: ZALO_INTEGRATION.id,
        externalLabelId: TAG.name,
      }),
    )
  })

  test("no Zalo API call — just DB insert", async () => {
    findTag.mockResolvedValue(TAG)
    findManyZaloIntegrations.mockResolvedValue([ZALO_INTEGRATION])

    await runCreate()

    expect(zaloRunAction).not.toHaveBeenCalled()
    expect(zaloTagFollower).not.toHaveBeenCalled()
  })

  test("skips Zalo integration with syncTagEnabledAt = null", async () => {
    findTag.mockResolvedValue(TAG)
    findManyZaloIntegrations.mockResolvedValue([
      { ...ZALO_INTEGRATION, syncTagEnabledAt: null },
    ])

    await runCreate()

    expect(tagChannelInsertIfAbsent).not.toHaveBeenCalled()
  })

  test("inserts for each enabled Zalo integration", async () => {
    const ZALO_2 = { ...ZALO_INTEGRATION, id: "zalo-int-2" }
    findTag.mockResolvedValue(TAG)
    findManyZaloIntegrations.mockResolvedValue([ZALO_INTEGRATION, ZALO_2])

    await runCreate()

    expect(tagChannelInsertIfAbsent).toHaveBeenCalledTimes(2)
  })
})

// ── syncTagAttach — Messenger ─────────────────────────────────────────────────
describe("syncTagAttach — Messenger (attachOnMessenger)", () => {
  const runAttach = () =>
    handleSyncTag({
      action: "attach",
      workspaceId: WS,
      tagId: TAG_ID,
      contactId: "contact-1",
    })

  const setupMessengerAttach = () => {
    findTag.mockResolvedValue(TAG)
    findManyContactInboxes.mockResolvedValue([MESSENGER_CONTACT_INBOX])
    findMessengerIntegrationByInboxId.mockResolvedValue(MESSENGER_INTEGRATION)
    findTagChannelByTagAndIntegration.mockResolvedValue(TAG_CHANNEL)
  }

  test("does NOT call createLabel when TagChannel already exists", async () => {
    setupMessengerAttach()

    await runAttach()

    expect(messengerCreateLabel).not.toHaveBeenCalled()
  })

  test("calls createLabel when TagChannel does not exist", async () => {
    findTag.mockResolvedValue(TAG)
    findManyContactInboxes.mockResolvedValue([MESSENGER_CONTACT_INBOX])
    findMessengerIntegrationByInboxId.mockResolvedValue(MESSENGER_INTEGRATION)
    findTagChannelByTagAndIntegration.mockResolvedValue(null) // lock: no existing → create
    tagChannelInsertOrFetch.mockResolvedValueOnce(TAG_CHANNEL) // insert returns row

    await runAttach()

    expect(messengerCreateLabel).toHaveBeenCalledTimes(1)
  })

  test("always calls assignLabel after resolving TagChannel", async () => {
    setupMessengerAttach()

    await runAttach()

    expect(messengerAssignLabel).toHaveBeenCalledTimes(1)
    expect(messengerAssignLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          labelId: TAG_CHANNEL.externalLabelId,
          sourceId: MESSENGER_CONTACT_INBOX.sourceId,
        }),
      }),
    )
  })

  test("links contactInbox to tagChannel after assignLabel", async () => {
    setupMessengerAttach()

    await runAttach()

    expect(tagChannelLinkContactInbox).toHaveBeenCalledWith({
      tagId: TAG_ID,
      tagChannelId: TAG_CHANNEL.id,
      contactInboxId: MESSENGER_CONTACT_INBOX.id,
    })
  })

  test("skips when tagChannel cannot be resolved (lock returns null)", async () => {
    findTag.mockResolvedValue(TAG)
    findManyContactInboxes.mockResolvedValue([MESSENGER_CONTACT_INBOX])
    findMessengerIntegrationByInboxId.mockResolvedValue(MESSENGER_INTEGRATION)
    findTagChannelByTagAndIntegration.mockResolvedValue(null)
    tagChannelInsertOrFetch.mockResolvedValue(undefined) // insert conflict, nothing returned

    await runAttach()

    expect(messengerAssignLabel).not.toHaveBeenCalled()
  })

  test("skips when integration has syncTagEnabledAt = null", async () => {
    findTag.mockResolvedValue(TAG)
    findManyContactInboxes.mockResolvedValue([MESSENGER_CONTACT_INBOX])
    findMessengerIntegrationByInboxId.mockResolvedValue({
      ...MESSENGER_INTEGRATION,
      syncTagEnabledAt: null,
    })

    await runAttach()

    expect(messengerAssignLabel).not.toHaveBeenCalled()
  })

  test("skips when tag not found", async () => {
    findTag.mockResolvedValue(null)

    await runAttach()

    expect(messengerAssignLabel).not.toHaveBeenCalled()
  })

  test("skips when no contact inboxes", async () => {
    findTag.mockResolvedValue(TAG)
    findManyContactInboxes.mockResolvedValue([])

    await runAttach()

    expect(messengerAssignLabel).not.toHaveBeenCalled()
  })
})

// ── syncTagAttach — Zalo ──────────────────────────────────────────────────────
describe("syncTagAttach — Zalo (attachOnZalo)", () => {
  const runAttach = () =>
    handleSyncTag({
      action: "attach",
      workspaceId: WS,
      tagId: TAG_ID,
      contactId: "contact-1",
    })

  const ZALO_TAG_CHANNEL = {
    id: "tc-zalo-1",
    externalLabelId: TAG.name,
    tagId: TAG_ID,
    workspaceId: WS,
    channelType: "zalo",
    integrationId: ZALO_INTEGRATION.id,
  }

  const setupZaloAttach = () => {
    findTag.mockResolvedValue(TAG)
    findManyContactInboxes.mockResolvedValue([ZALO_CONTACT_INBOX])
    findZaloIntegrationByInboxId.mockResolvedValue(ZALO_INTEGRATION)
    tagChannelUpsertByTagAndIntegration.mockResolvedValue(ZALO_TAG_CHANNEL)
  }

  test("calls tagFollower Zalo action", async () => {
    setupZaloAttach()

    await runAttach()

    expect(zaloTagFollower).toHaveBeenCalledTimes(1)
    expect(zaloTagFollower).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ZALO_CONTACT_INBOX.sourceId,
        tagName: TAG.name,
      }),
    )
  })

  test("upserts tagChannelModel via upsertByTagAndIntegration", async () => {
    setupZaloAttach()

    await runAttach()

    expect(tagChannelUpsertByTagAndIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        tagId: TAG_ID,
        channelType: "zalo",
        integrationId: ZALO_INTEGRATION.id,
        externalLabelId: TAG.name,
      }),
    )
  })

  test("links contactInbox to tagChannel after upsert", async () => {
    setupZaloAttach()

    await runAttach()

    expect(tagChannelLinkContactInbox).toHaveBeenCalledWith({
      tagId: TAG_ID,
      tagChannelId: ZALO_TAG_CHANNEL.id,
      contactInboxId: ZALO_CONTACT_INBOX.id,
    })
  })

  test("skips contactInbox link when tagChannel upsert returns nothing", async () => {
    setupZaloAttach()
    tagChannelUpsertByTagAndIntegration.mockResolvedValue(undefined) // upsert returns empty (unexpected)

    await runAttach()

    // The upsert still fires; no link call
    expect(tagChannelUpsertByTagAndIntegration).toHaveBeenCalledTimes(1)
    expect(tagChannelLinkContactInbox).not.toHaveBeenCalled()
  })

  test("skips when integration has syncTagEnabledAt = null", async () => {
    findTag.mockResolvedValue(TAG)
    findManyContactInboxes.mockResolvedValue([ZALO_CONTACT_INBOX])
    findZaloIntegrationByInboxId.mockResolvedValue({
      ...ZALO_INTEGRATION,
      syncTagEnabledAt: null,
    })

    await runAttach()

    expect(zaloTagFollower).not.toHaveBeenCalled()
  })

  test("routes messenger and zalo inboxes independently in the same attach", async () => {
    findTag.mockResolvedValue(TAG)
    findManyContactInboxes.mockResolvedValue([
      MESSENGER_CONTACT_INBOX,
      ZALO_CONTACT_INBOX,
    ])
    findMessengerIntegrationByInboxId.mockResolvedValue(MESSENGER_INTEGRATION)
    findTagChannelByTagAndIntegration.mockResolvedValue(TAG_CHANNEL)
    findZaloIntegrationByInboxId.mockResolvedValue(ZALO_INTEGRATION)
    tagChannelUpsertByTagAndIntegration.mockResolvedValue(TAG_CHANNEL)

    await runAttach()

    expect(messengerAssignLabel).toHaveBeenCalledTimes(1)
    expect(zaloTagFollower).toHaveBeenCalledTimes(1)
  })
})

// ── handleSyncTag dispatch ────────────────────────────────────────────────────
describe("handleSyncTag — dispatch", () => {
  test("logs warning for unknown action", async () => {
    const { logger } = await import("../src/lib/logger")
    // @ts-expect-error - testing unknown action
    await handleSyncTag({ action: "unknown", workspaceId: WS, tagId: TAG_ID })
    expect(logger.warn).toHaveBeenCalled()
  })
})
