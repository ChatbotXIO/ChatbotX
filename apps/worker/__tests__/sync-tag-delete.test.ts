import { beforeEach, describe, expect, test, vi } from "vitest"

// ── repository / service spies ────────────────────────────────────────────────
const findManyTagChannel = vi.fn()
const findMessengerIntegrationById = vi.fn()
const findZaloIntegrationUnscoped = vi.fn()

// Cleanup mutation spies
const tagChannelListContactInboxIdsForChannelPage = vi.fn()
const tagChannelDeleteLinksForChannel = vi.fn()
const tagChannelDeleteContactTagsForContacts = vi.fn()
const tagChannelDeleteById = vi.fn()
const tagChannelListTaggedContactIdsPage = vi.fn()
const contactInboxListContactIdsByIds = vi.fn()
const tagServiceHardDeleteSoftDeleted = vi.fn()

// Track calls in order so we can assert on sequence.
const callLog: string[] = []

// ── channel API spies ─────────────────────────────────────────────────────────
const messengerDeleteLabel = vi.fn()
const zaloRemoveTag = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  tagChannelRepository: {
    listByTag: (...args: unknown[]) => findManyTagChannel(...args),
    listContactInboxIdsForChannelPage: (...args: unknown[]) =>
      tagChannelListContactInboxIdsForChannelPage(...args),
    deleteLinksForChannel: (...args: unknown[]) => {
      callLog.push("deleteLinksForChannel")
      return tagChannelDeleteLinksForChannel(...args)
    },
    deleteContactTagsForContacts: (...args: unknown[]) => {
      callLog.push("deleteContactTagsForContacts")
      return tagChannelDeleteContactTagsForContacts(...args)
    },
    deleteById: (...args: unknown[]) => {
      callLog.push("deleteById")
      return tagChannelDeleteById(...args)
    },
    listTaggedContactIdsPage: (...args: unknown[]) =>
      tagChannelListTaggedContactIdsPage(...args),
  },
  contactInboxRepository: {
    listContactIdsByIds: (...args: unknown[]) =>
      contactInboxListContactIdsByIds(...args),
  },
  integrationMessengerRepository: {
    findById: (...args: unknown[]) => findMessengerIntegrationById(...args),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({ auth: {}, workspaceId: "ws-1" }),
  tagService: {
    hardDeleteSoftDeleted: (...args: unknown[]) => {
      callLog.push("hardDeleteSoftDeleted")
      return tagServiceHardDeleteSoftDeleted(...args)
    },
  },
  zaloIntegrationService: {
    findByIdUnscoped: (...args: unknown[]) =>
      findZaloIntegrationUnscoped(...args),
  },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  // Single-pass chunkById: the query builder pages by id; with our small fixed
  // result sets it returns < chunkSize on the first call and stops.
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

vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: {
    runChannelHandler: (_group: unknown, name: unknown, ...args: unknown[]) => {
      if (name === "deleteLabel") {
        return messengerDeleteLabel(...args)
      }
      return Promise.resolve()
    },
  },
}))

vi.mock("@chatbotx.io/integration-zalo", () => ({
  integration: {
    runAction: (name: unknown, ...args: unknown[]) => {
      if (name === "removeTag") {
        return zaloRemoveTag(...args)
      }
      return Promise.resolve()
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

const MESSENGER_CHANNEL = {
  id: "tc-1",
  channelType: "messenger",
  integrationId: "int-1",
  externalLabelId: "fb-label-123",
}
const ZALO_CHANNEL = {
  id: "tc-2",
  channelType: "zalo",
  integrationId: "zalo-int-1",
  externalLabelId: "VIP",
}
const ENABLED_MESSENGER = {
  id: "int-1",
  syncTagEnabledAt: new Date(),
  auth: {},
}
const ENABLED_ZALO = {
  id: "zalo-int-1",
  syncTagEnabledAt: new Date(),
  auth: {},
}

const runDelete = () =>
  handleSyncTag({ action: "delete", workspaceId: WS, tagId: TAG_ID })

const runScopedDelete = (channelType: string, integrationId: string) =>
  handleSyncTag({
    action: "delete",
    workspaceId: WS,
    tagId: TAG_ID,
    channelType: channelType as "messenger" | "zalo",
    integrationId,
  })

beforeEach(() => {
  findManyTagChannel.mockReset()
  findMessengerIntegrationById.mockReset()
  findZaloIntegrationUnscoped.mockReset()
  tagChannelListContactInboxIdsForChannelPage.mockReset()
  tagChannelDeleteLinksForChannel.mockReset()
  tagChannelDeleteContactTagsForContacts.mockReset()
  tagChannelDeleteById.mockReset()
  tagChannelListTaggedContactIdsPage.mockReset()
  contactInboxListContactIdsByIds.mockReset()
  tagServiceHardDeleteSoftDeleted.mockReset()
  messengerDeleteLabel.mockReset()
  zaloRemoveTag.mockReset()
  callLog.length = 0

  findManyTagChannel.mockResolvedValue([])
  tagChannelListContactInboxIdsForChannelPage.mockResolvedValue([])
  tagChannelDeleteLinksForChannel.mockResolvedValue(undefined)
  tagChannelDeleteContactTagsForContacts.mockResolvedValue(undefined)
  tagChannelDeleteById.mockResolvedValue(undefined)
  tagChannelListTaggedContactIdsPage.mockResolvedValue([])
  contactInboxListContactIdsByIds.mockResolvedValue([])
  tagServiceHardDeleteSoftDeleted.mockResolvedValue(undefined)
  findMessengerIntegrationById.mockResolvedValue(ENABLED_MESSENGER)
  findZaloIntegrationUnscoped.mockResolvedValue(ENABLED_ZALO)
  messengerDeleteLabel.mockResolvedValue(undefined)
  zaloRemoveTag.mockResolvedValue(undefined)
})

// ============================================================================
// Full workspace delete (delete-tag-action): callApi=true + Tag row removed
// ============================================================================
describe("syncTagDelete — full workspace delete", () => {
  test("does NOT call any channel label API (temporarily disabled)", async () => {
    findManyTagChannel.mockResolvedValue([MESSENGER_CHANNEL, ZALO_CHANNEL])

    await runDelete()

    expect(messengerDeleteLabel).not.toHaveBeenCalled()
    expect(zaloRemoveTag).not.toHaveBeenCalled()
    // cleanup + Tag delete still happen
    expect(callLog.at(-1)).toBe("hardDeleteSoftDeleted")
  })

  test("hard-deletes the Tag row LAST, via tagService.hardDeleteSoftDeleted", async () => {
    findManyTagChannel.mockResolvedValue([MESSENGER_CHANNEL])

    await runDelete()

    expect(callLog.at(-1)).toBe("hardDeleteSoftDeleted")
    expect(tagServiceHardDeleteSoftDeleted).toHaveBeenCalledWith({
      workspaceId: WS,
      tagId: TAG_ID,
    })
  })

  test("per channel: deletes ContactToTagChannel links + ContactsToTags + TagChannel, then Tag", async () => {
    findManyTagChannel.mockResolvedValue([MESSENGER_CHANNEL])
    tagChannelListContactInboxIdsForChannelPage.mockResolvedValue([
      { contactInboxId: "ci-1" },
    ])
    contactInboxListContactIdsByIds.mockResolvedValue([{ contactId: "c-1" }])

    await runDelete()

    expect(callLog).toContain("deleteLinksForChannel")
    expect(callLog).toContain("deleteContactTagsForContacts")
    expect(callLog).toContain("deleteById")
    expect(callLog.at(-1)).toBe("hardDeleteSoftDeleted")
    expect(tagChannelDeleteLinksForChannel).toHaveBeenCalledWith({
      tagChannelId: MESSENGER_CHANNEL.id,
      contactInboxIds: ["ci-1"],
    })
    expect(tagChannelDeleteContactTagsForContacts).toHaveBeenCalledWith({
      tagId: TAG_ID,
      contactIds: ["c-1"],
    })
    expect(tagChannelDeleteById).toHaveBeenCalledWith({
      id: MESSENGER_CHANNEL.id,
    })
  })

  test("catch-all removes manually-applied ContactToTag (no channel mapping)", async () => {
    findManyTagChannel.mockResolvedValue([]) // tag never synced to a channel
    tagChannelListTaggedContactIdsPage.mockResolvedValue([
      { contactId: "c-manual" },
    ])

    await runDelete()

    expect(tagChannelDeleteContactTagsForContacts).toHaveBeenCalledWith({
      tagId: TAG_ID,
      contactIds: ["c-manual"],
    })
    expect(callLog.at(-1)).toBe("hardDeleteSoftDeleted")
  })

  test("no channels, no manual links → only the Tag row is deleted", async () => {
    findManyTagChannel.mockResolvedValue([])
    tagChannelListTaggedContactIdsPage.mockResolvedValue([])

    await runDelete()

    expect(callLog).toEqual(["hardDeleteSoftDeleted"])
  })

  test("deletes the Tag regardless of integration sync state (API disabled)", async () => {
    findManyTagChannel.mockResolvedValue([MESSENGER_CHANNEL])
    findMessengerIntegrationById.mockResolvedValue({
      ...ENABLED_MESSENGER,
      syncTagEnabledAt: null,
    })

    await runDelete()

    expect(messengerDeleteLabel).not.toHaveBeenCalled()
    expect(callLog.at(-1)).toBe("hardDeleteSoftDeleted")
  })
})

// ============================================================================
// Channel-scoped delete (inbound webhook): no API, no Tag row
// ============================================================================
describe("syncTagDelete — channel-scoped (webhook)", () => {
  test("does NOT call the channel API and does NOT delete the Tag row", async () => {
    findManyTagChannel.mockResolvedValue([ZALO_CHANNEL])
    tagChannelListContactInboxIdsForChannelPage.mockResolvedValue([
      { contactInboxId: "ci-1" },
    ])
    contactInboxListContactIdsByIds.mockResolvedValue([{ contactId: "c-1" }])

    await runScopedDelete("zalo", "zalo-int-1")

    // The channel already removed the label → no API call.
    expect(zaloRemoveTag).not.toHaveBeenCalled()
    expect(messengerDeleteLabel).not.toHaveBeenCalled()

    expect(callLog).toContain("deleteLinksForChannel")
    expect(callLog).toContain("deleteContactTagsForContacts")
    expect(callLog).toContain("deleteById")
    // Tag row is kept.
    expect(callLog).not.toContain("hardDeleteSoftDeleted")
    expect(tagServiceHardDeleteSoftDeleted).not.toHaveBeenCalled()
  })

  test("no-op when the tag is not mapped on that channel", async () => {
    findManyTagChannel.mockResolvedValue([])

    await runScopedDelete("zalo", "zalo-int-1")

    expect(callLog).toHaveLength(0)
  })
})
