import { beforeEach, describe, expect, test, vi } from "vitest"

// ── repository / service spies ────────────────────────────────────────────────
// syncTagDetach resolves mapping rows via tagChannelRepository.listContactTagChannelRows
const listContactTagChannelRows = vi.fn()
const unlinkContactInbox = vi.fn()

// ── integration context resolution ────────────────────────────────────────────
const findMessengerIntegrationById = vi.fn()
const findZaloIntegrationUnscoped = vi.fn()

// ── channel API spies ─────────────────────────────────────────────────────────
const messengerRemoveLabel = vi.fn()
const zaloRemoveFollower = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  tagChannelRepository: {
    listContactTagChannelRows: (...args: unknown[]) =>
      listContactTagChannelRows(...args),
    unlinkContactInbox: (...args: unknown[]) => unlinkContactInbox(...args),
  },
  integrationMessengerRepository: {
    findById: (...args: unknown[]) => findMessengerIntegrationById(...args),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: vi.fn().mockResolvedValue({ auth: {}, workspaceId: "ws-1" }),
  zaloIntegrationService: {
    findByIdUnscoped: (...args: unknown[]) =>
      findZaloIntegrationUnscoped(...args),
  },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  integration: {
    runChannelHandler: (_group: unknown, name: unknown, ...args: unknown[]) => {
      if (name === "removeLabel") {
        return messengerRemoveLabel(...args)
      }
      return Promise.resolve()
    },
  },
}))

vi.mock("@chatbotx.io/integration-zalo", () => ({
  integration: {
    runAction: (name: unknown, ...args: unknown[]) => {
      if (name === "removeFollowerFromTag") {
        return zaloRemoveFollower(...args)
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
const CONTACT_ID = "contact-1"

const MESSENGER_ROW = {
  tagChannelId: "tc-1",
  contactInboxId: "ci-1",
  channelType: "messenger",
  integrationId: "int-1",
  externalLabelId: "fb-label-123",
  sourceId: "psid-1",
}
const ZALO_ROW = {
  tagChannelId: "tc-zalo-1",
  contactInboxId: "ci-2",
  channelType: "zalo",
  integrationId: "zalo-int-1",
  externalLabelId: "VIP",
  sourceId: "zalo-uid-1",
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

const runDetach = () =>
  handleSyncTag({
    action: "detach",
    workspaceId: WS,
    tagId: TAG_ID,
    contactId: CONTACT_ID,
  })

beforeEach(() => {
  listContactTagChannelRows.mockReset()
  unlinkContactInbox.mockReset()
  findMessengerIntegrationById.mockReset()
  findZaloIntegrationUnscoped.mockReset()
  messengerRemoveLabel.mockReset()
  zaloRemoveFollower.mockReset()

  listContactTagChannelRows.mockResolvedValue([])
  unlinkContactInbox.mockResolvedValue(undefined)
  findMessengerIntegrationById.mockResolvedValue(ENABLED_MESSENGER)
  findZaloIntegrationUnscoped.mockResolvedValue(ENABLED_ZALO)
  messengerRemoveLabel.mockResolvedValue(undefined)
  zaloRemoveFollower.mockResolvedValue(undefined)
})

describe("syncTagDetach", () => {
  test("no mapping rows: no API calls, no unlinks", async () => {
    listContactTagChannelRows.mockResolvedValue([])

    await runDetach()

    expect(messengerRemoveLabel).not.toHaveBeenCalled()
    expect(zaloRemoveFollower).not.toHaveBeenCalled()
    expect(unlinkContactInbox).not.toHaveBeenCalled()
  })

  test("messenger row: calls removeLabel then unlinks mapping", async () => {
    listContactTagChannelRows.mockResolvedValue([MESSENGER_ROW])

    await runDetach()

    expect(messengerRemoveLabel).toHaveBeenCalledTimes(1)
    expect(messengerRemoveLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          labelId: MESSENGER_ROW.externalLabelId,
          sourceId: MESSENGER_ROW.sourceId,
        }),
      }),
    )
    expect(unlinkContactInbox).toHaveBeenCalledTimes(1)
  })

  test("zalo row: calls removeFollowerFromTag then unlinks mapping", async () => {
    listContactTagChannelRows.mockResolvedValue([ZALO_ROW])

    await runDetach()

    expect(zaloRemoveFollower).toHaveBeenCalledTimes(1)
    expect(zaloRemoveFollower).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ZALO_ROW.sourceId,
        tagName: ZALO_ROW.externalLabelId,
      }),
    )
    expect(unlinkContactInbox).toHaveBeenCalledTimes(1)
  })

  test("unlinks local mapping even when channel API throws", async () => {
    listContactTagChannelRows.mockResolvedValue([MESSENGER_ROW])
    messengerRemoveLabel.mockRejectedValue(new Error("Facebook API down"))

    await runDetach()

    // API failed but the local mapping is still unlinked
    expect(unlinkContactInbox).toHaveBeenCalledTimes(1)
  })

  test("skips messenger API when integration sync disabled, still unlinks mapping", async () => {
    listContactTagChannelRows.mockResolvedValue([MESSENGER_ROW])
    findMessengerIntegrationById.mockResolvedValue({
      ...ENABLED_MESSENGER,
      syncTagEnabledAt: null,
    })

    await runDetach()

    expect(messengerRemoveLabel).not.toHaveBeenCalled()
    expect(unlinkContactInbox).toHaveBeenCalledTimes(1)
  })

  test("skips zalo API when integration sync disabled, still unlinks mapping", async () => {
    listContactTagChannelRows.mockResolvedValue([ZALO_ROW])
    findZaloIntegrationUnscoped.mockResolvedValue({
      ...ENABLED_ZALO,
      syncTagEnabledAt: null,
    })

    await runDetach()

    expect(zaloRemoveFollower).not.toHaveBeenCalled()
    expect(unlinkContactInbox).toHaveBeenCalledTimes(1)
  })

  test("processes multiple rows: one unlink per row", async () => {
    listContactTagChannelRows.mockResolvedValue([MESSENGER_ROW, ZALO_ROW])

    await runDetach()

    expect(messengerRemoveLabel).toHaveBeenCalledTimes(1)
    expect(zaloRemoveFollower).toHaveBeenCalledTimes(1)
    expect(unlinkContactInbox).toHaveBeenCalledTimes(2)
  })

  test("unlink is scoped by tagChannelId AND contactInboxId", async () => {
    listContactTagChannelRows.mockResolvedValue([MESSENGER_ROW])

    await runDetach()

    expect(unlinkContactInbox).toHaveBeenCalledWith({
      tagChannelId: MESSENGER_ROW.tagChannelId,
      contactInboxId: MESSENGER_ROW.contactInboxId,
    })
  })

  test("continues to second row when first row API throws", async () => {
    listContactTagChannelRows.mockResolvedValue([MESSENGER_ROW, ZALO_ROW])
    messengerRemoveLabel.mockRejectedValue(new Error("boom"))

    await runDetach()

    // Both rows still unlinked; zalo API still called
    expect(zaloRemoveFollower).toHaveBeenCalledTimes(1)
    expect(unlinkContactInbox).toHaveBeenCalledTimes(2)
  })
})
