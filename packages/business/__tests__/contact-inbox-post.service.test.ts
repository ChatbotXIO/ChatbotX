import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  dbTransaction: vi.fn(),
  deleteByContactInboxIds: vi.fn(),
  deleteWorkspaceBatch: vi.fn(),
  hasWorkspaceRows: vi.fn(),
  insertIfParentExists: vi.fn(),
  lockContactInboxIdsByContactIds: vi.fn(),
  lockContactsForDelete: vi.fn(),
  lockWorkspaceForPostWrite: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.dbTransaction },
}))

vi.mock("@chatbotx.io/database/repositories/contact-inbox-post", () => ({
  contactInboxPostRepository: {
    deleteByContactInboxIds: mocks.deleteByContactInboxIds,
    deleteWorkspaceBatch: mocks.deleteWorkspaceBatch,
    hasWorkspaceRows: mocks.hasWorkspaceRows,
    insertIfParentExists: mocks.insertIfParentExists,
    lockContactInboxIdsByContactIds: mocks.lockContactInboxIdsByContactIds,
    lockContactsForDelete: mocks.lockContactsForDelete,
    lockWorkspaceForPostWrite: mocks.lockWorkspaceForPostWrite,
  },
}))

const { contactInboxPostService } = await import(
  "../src/contact-inbox-post/service"
)

describe("contactInboxPostService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dbTransaction.mockImplementation(async (callback) =>
      callback({ transaction: vi.fn() }),
    )
    mocks.lockWorkspaceForPostWrite.mockResolvedValue(true)
    mocks.insertIfParentExists.mockResolvedValue(true)
    mocks.lockContactsForDelete.mockResolvedValue([])
    mocks.lockContactInboxIdsByContactIds.mockResolvedValue([])
    mocks.deleteByContactInboxIds.mockResolvedValue(0)
  })

  test("does not insert after the durable workspace purge fence is set", async () => {
    mocks.lockWorkspaceForPostWrite.mockResolvedValue(false)

    await expect(
      contactInboxPostService.recordComment({
        commentedAt: new Date("2026-09-30T00:00:00.000Z"),
        contactInboxId: "contact-inbox-1",
        inboxChannel: "instagram",
        inboxId: "inbox-1",
        integrationType: "instagram",
        postId: "post-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(false)

    expect(mocks.insertIfParentExists).not.toHaveBeenCalled()
  })

  test("rejects a contact inbox whose channel does not match the integration", async () => {
    await expect(
      contactInboxPostService.recordComment({
        commentedAt: new Date("2026-09-30T00:00:00.000Z"),
        contactInboxId: "contact-inbox-1",
        inboxChannel: "messenger",
        inboxId: "inbox-1",
        integrationType: "instagram",
        postId: "post-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(false)

    expect(mocks.dbTransaction).not.toHaveBeenCalled()
    expect(mocks.insertIfParentExists).not.toHaveBeenCalled()
  })

  test("permits either Instagram integration type after post ownership changes", async () => {
    await expect(
      contactInboxPostService.recordComment({
        commentedAt: new Date("2026-09-30T00:00:00.000Z"),
        contactInboxId: "contact-inbox-1",
        inboxChannel: "instagram",
        inboxId: "inbox-1",
        integrationType: "instagramFacebook",
        postId: "post-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(true)

    expect(mocks.insertIfParentExists).toHaveBeenCalledWith(
      {
        channel: "instagram",
        commentedAt: new Date("2026-09-30T00:00:00.000Z"),
        contactInboxId: "contact-inbox-1",
        inboxId: "inbox-1",
        postId: "post-1",
        workspaceId: "workspace-1",
      },
      expect.anything(),
    )
  })

  test("deletes contact-inbox post rows in 500-id sub-chunks", async () => {
    const contactInboxIds = Array.from({ length: 501 }, (_, index) =>
      String(index + 1),
    )
    mocks.lockContactsForDelete.mockResolvedValue(["contact-1"])
    mocks.lockContactInboxIdsByContactIds.mockResolvedValue(contactInboxIds)
    mocks.deleteByContactInboxIds.mockResolvedValue(1)
    const calls: string[] = []
    mocks.lockWorkspaceForPostWrite.mockImplementation(() => {
      calls.push("workspace")
      return Promise.resolve(true)
    })
    mocks.lockContactsForDelete.mockImplementation(() => {
      calls.push("contacts")
      return Promise.resolve(["contact-1"])
    })
    mocks.lockContactInboxIdsByContactIds.mockImplementation(() => {
      calls.push("contact-inboxes")
      return Promise.resolve(contactInboxIds)
    })
    mocks.deleteByContactInboxIds.mockImplementation(() => {
      calls.push("posts")
      return Promise.resolve(1)
    })

    await expect(
      contactInboxPostService.deleteForContacts({
        contactIds: ["contact-1"],
        tx: { transaction: vi.fn() } as never,
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(2)

    expect(mocks.deleteByContactInboxIds).toHaveBeenCalledTimes(2)
    expect(
      mocks.deleteByContactInboxIds.mock.calls[0]?.[0].contactInboxIds,
    ).toHaveLength(500)
    expect(
      mocks.deleteByContactInboxIds.mock.calls[1]?.[0].contactInboxIds,
    ).toHaveLength(1)
    expect(calls).toEqual([
      "workspace",
      "contacts",
      "contact-inboxes",
      "posts",
      "posts",
    ])
  })

  test("checks for remaining rows after an exact final purge batch", async () => {
    mocks.deleteWorkspaceBatch.mockResolvedValue(2)
    mocks.hasWorkspaceRows.mockResolvedValue(false)

    await expect(
      contactInboxPostService.purgeWorkspace({
        batchSize: 2,
        maxBatches: 1,
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({ complete: true, deleted: 2 })

    expect(mocks.hasWorkspaceRows).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
    })
  })

  test("reports incomplete when rows remain after the purge cap", async () => {
    mocks.deleteWorkspaceBatch.mockResolvedValue(2)
    mocks.hasWorkspaceRows.mockResolvedValue(true)

    await expect(
      contactInboxPostService.purgeWorkspace({
        batchSize: 2,
        maxBatches: 1,
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({ complete: false, deleted: 2 })
  })
})
