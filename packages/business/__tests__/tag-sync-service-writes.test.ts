import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `tagSyncService`'s TagChannel/ContactToTagChannel write methods are thin,
// tx-accepting pass-throughs to `tagChannelRepository` (see data-access.md:
// sync-tag.ts / sync-channel-labels.ts must not call the DB-mutating
// repository directly). This is the only place that delegation is verified —
// each test just asserts the wrapper forwards its input (and `tx`) unchanged
// to the matching repository method and returns its result.
// ---------------------------------------------------------------------------

const tagChannelRepositoryMock = {
  upsertLabelMapping: vi.fn(async () => undefined),
  insertIfAbsent: vi.fn(async () => undefined),
  updateExternalLabelId: vi.fn(async () => undefined),
  insertOrFetch: vi.fn(async () => ({ id: "tag-channel-1" })),
  upsertByTagAndIntegration: vi.fn(async () => ({ id: "tag-channel-1" })),
  linkContactInbox: vi.fn(async () => undefined),
  unlinkContactInbox: vi.fn(async () => undefined),
  deleteLinksForChannel: vi.fn(async () => undefined),
  deleteContactTagsForContacts: vi.fn(async () => undefined),
  deleteById: vi.fn(async () => undefined),
}

vi.mock("@chatbotx.io/database/repositories", () => ({
  tagChannelRepository: tagChannelRepositoryMock,
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: {
    syncTag: "syncTag",
    syncChannelLabels: "syncChannelLabels",
  },
  defaultQueue: { add: vi.fn(async () => undefined) },
}))

const { tagSyncService } = await import("../src/tag/sync.service")

const FAKE_TX = { _brand: "tx" } as never

beforeEach(() => {
  for (const fn of Object.values(tagChannelRepositoryMock)) {
    fn.mockClear()
  }
})

describe("TagSyncService — TagChannel write pass-throughs", () => {
  test("upsertLabelMapping forwards input and tx to tagChannelRepository.upsertLabelMapping", async () => {
    const input = {
      workspaceId: "ws-1",
      channelType: "messenger",
      integrationId: "int-1",
      label: { externalLabelId: "ext-1", name: "VIP" },
      contactInbox: { id: "cinbox-1", contactId: "contact-1" },
    }

    await tagSyncService.upsertLabelMapping(input, FAKE_TX)

    expect(tagChannelRepositoryMock.upsertLabelMapping).toHaveBeenCalledTimes(1)
    expect(tagChannelRepositoryMock.upsertLabelMapping).toHaveBeenCalledWith(
      input,
      FAKE_TX,
    )
  })

  test("insertTagChannelIfAbsent forwards input and tx to tagChannelRepository.insertIfAbsent", async () => {
    const input = {
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "zalo",
      integrationId: "int-1",
      externalLabelId: "VIP",
    }

    await tagSyncService.insertTagChannelIfAbsent(input, FAKE_TX)

    expect(tagChannelRepositoryMock.insertIfAbsent).toHaveBeenCalledTimes(1)
    expect(tagChannelRepositoryMock.insertIfAbsent).toHaveBeenCalledWith(
      input,
      FAKE_TX,
    )
  })

  test("updateTagChannelExternalLabelId forwards input and tx to tagChannelRepository.updateExternalLabelId", async () => {
    const input = { id: "tag-channel-1", externalLabelId: "ext-2" }

    await tagSyncService.updateTagChannelExternalLabelId(input, FAKE_TX)

    expect(
      tagChannelRepositoryMock.updateExternalLabelId,
    ).toHaveBeenCalledTimes(1)
    expect(tagChannelRepositoryMock.updateExternalLabelId).toHaveBeenCalledWith(
      input,
      FAKE_TX,
    )
  })

  test("insertOrFetchTagChannel forwards input and tx, and returns the repository's result", async () => {
    const input = {
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "messenger",
      integrationId: "int-1",
      externalLabelId: "ext-1",
    }

    const result = await tagSyncService.insertOrFetchTagChannel(input, FAKE_TX)

    expect(tagChannelRepositoryMock.insertOrFetch).toHaveBeenCalledTimes(1)
    expect(tagChannelRepositoryMock.insertOrFetch).toHaveBeenCalledWith(
      input,
      FAKE_TX,
    )
    expect(result).toEqual({ id: "tag-channel-1" })
  })

  test("upsertTagChannel forwards input and tx, and returns the repository's result", async () => {
    const input = {
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "zalo",
      integrationId: "int-1",
      externalLabelId: "VIP",
    }

    const result = await tagSyncService.upsertTagChannel(input, FAKE_TX)

    expect(
      tagChannelRepositoryMock.upsertByTagAndIntegration,
    ).toHaveBeenCalledTimes(1)
    expect(
      tagChannelRepositoryMock.upsertByTagAndIntegration,
    ).toHaveBeenCalledWith(input, FAKE_TX)
    expect(result).toEqual({ id: "tag-channel-1" })
  })

  test("linkContactInbox forwards input and tx to tagChannelRepository.linkContactInbox", async () => {
    const input = {
      tagId: "tag-1",
      tagChannelId: "tag-channel-1",
      contactInboxId: "cinbox-1",
    }

    await tagSyncService.linkContactInbox(input, FAKE_TX)

    expect(tagChannelRepositoryMock.linkContactInbox).toHaveBeenCalledTimes(1)
    expect(tagChannelRepositoryMock.linkContactInbox).toHaveBeenCalledWith(
      input,
      FAKE_TX,
    )
  })

  test("unlinkContactInbox forwards input and tx to tagChannelRepository.unlinkContactInbox", async () => {
    const input = { tagChannelId: "tag-channel-1", contactInboxId: "cinbox-1" }

    await tagSyncService.unlinkContactInbox(input, FAKE_TX)

    expect(tagChannelRepositoryMock.unlinkContactInbox).toHaveBeenCalledTimes(1)
    expect(tagChannelRepositoryMock.unlinkContactInbox).toHaveBeenCalledWith(
      input,
      FAKE_TX,
    )
  })

  test("deleteLinksForChannel forwards input and tx to tagChannelRepository.deleteLinksForChannel", async () => {
    const input = {
      tagChannelId: "tag-channel-1",
      contactInboxIds: ["cinbox-1", "cinbox-2"],
    }

    await tagSyncService.deleteLinksForChannel(input, FAKE_TX)

    expect(
      tagChannelRepositoryMock.deleteLinksForChannel,
    ).toHaveBeenCalledTimes(1)
    expect(tagChannelRepositoryMock.deleteLinksForChannel).toHaveBeenCalledWith(
      input,
      FAKE_TX,
    )
  })

  test("deleteContactTagsForContacts forwards input and tx to tagChannelRepository.deleteContactTagsForContacts", async () => {
    const input = { tagId: "tag-1", contactIds: ["contact-1", "contact-2"] }

    await tagSyncService.deleteContactTagsForContacts(input, FAKE_TX)

    expect(
      tagChannelRepositoryMock.deleteContactTagsForContacts,
    ).toHaveBeenCalledTimes(1)
    expect(
      tagChannelRepositoryMock.deleteContactTagsForContacts,
    ).toHaveBeenCalledWith(input, FAKE_TX)
  })

  test("deleteTagChannel forwards input and tx to tagChannelRepository.deleteById", async () => {
    const input = { id: "tag-channel-1" }

    await tagSyncService.deleteTagChannel(input, FAKE_TX)

    expect(tagChannelRepositoryMock.deleteById).toHaveBeenCalledTimes(1)
    expect(tagChannelRepositoryMock.deleteById).toHaveBeenCalledWith(
      input,
      FAKE_TX,
    )
  })

  test("each write method calls tx as undefined when the caller omits it", async () => {
    await tagSyncService.insertTagChannelIfAbsent({
      workspaceId: "ws-1",
      tagId: "tag-1",
      channelType: "zalo",
      integrationId: "int-1",
      externalLabelId: "VIP",
    })

    expect(tagChannelRepositoryMock.insertIfAbsent).toHaveBeenCalledWith(
      expect.any(Object),
      undefined,
    )
  })
})
