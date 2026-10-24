import { beforeEach, describe, expect, test, vi } from "vitest"
import { WorkspacePurgeIncompleteError } from "../../errors"

const {
  mockConnectionTransition,
  mockFindByInboxId,
  mockHasPartitionedWorkspaceRows,
  mockHasWorkspaceRows,
  mockListMessageConversationPage,
  mockListWithIntegrationsByWorkspace,
  mockInboxDisconnect,
  mockDeleteMessagesAndAttachments,
  mockDeletePartitionedBatch,
  mockDeleteWorkspaceRowsBatch,
  mockTransaction,
} = vi.hoisted(() => {
  const execute = vi.fn()
  return {
    mockConnectionTransition: vi.fn(),
    mockDeleteMessagesAndAttachments: vi.fn(),
    mockDeletePartitionedBatch: vi.fn(),
    mockDeleteWorkspaceRowsBatch: vi.fn(),
    mockFindByInboxId: vi.fn(),
    mockHasPartitionedWorkspaceRows: vi.fn(),
    mockHasWorkspaceRows: vi.fn(),
    mockInboxDisconnect: vi.fn().mockResolvedValue(undefined),
    mockListMessageConversationPage: vi.fn(),
    mockListWithIntegrationsByWorkspace: vi.fn(),
    mockTransaction: vi.fn((callback: (tx: unknown) => unknown) =>
      callback({ execute }),
    ),
  }
})

vi.mock("../../leaderboard/purge", () => ({
  purgeLeaderboardDataForWorkspace: vi.fn().mockResolvedValue(0),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mockTransaction },
  sql: Object.assign(
    vi.fn(() => ({})),
    { raw: vi.fn(() => "") },
  ),
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findByInboxId: mockFindByInboxId },
  HEAVY_WORKSPACE_TABLES: ["ErrorLog"],
  LIVE_RUN_STATUSES: [],
  NO_FK_WORKSPACE_TABLES: [],
  PARTITIONED_WORKSPACE_TABLES: [
    {
      primaryKey: ["broadcastId", "contactId"],
      selector: "broadcastWorkspace",
      table: "ContactOnBroadcast",
    },
  ],
  PULL_CLAIMABLE_STATUSES: [],
  WORKSPACE_ANALYTICS_HYPERTABLES: ["AnalyticsContactEvent"],
  workspacePurgeRepository: {
    deleteAnalyticsSlice: vi.fn(),
    deleteMessagesAndAttachments: mockDeleteMessagesAndAttachments,
    deletePartitionedBatch: mockDeletePartitionedBatch,
    deleteWorkspaceRowsBatch: mockDeleteWorkspaceRowsBatch,
    findNextAnalyticsRowAt: vi.fn().mockResolvedValue(null),
    hasPartitionedWorkspaceRows: mockHasPartitionedWorkspaceRows,
    hasWorkspaceRows: mockHasWorkspaceRows,
    listMessageConversationPage: mockListMessageConversationPage,
  },
}))

vi.mock("../../connection/state-service", () => ({
  connectionStateService: { transition: mockConnectionTransition },
}))

vi.mock("../../inbox/service", () => ({
  inboxService: {
    listWithIntegrationsByWorkspace: mockListWithIntegrationsByWorkspace,
    disconnect: mockInboxDisconnect,
  },
}))

const { workspaceLifecycleService } = await import("../service")

const deadlineAt = () => Date.now() + 60_000

describe("workspaceLifecycleService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConnectionTransition.mockResolvedValue(undefined)
    mockDeleteMessagesAndAttachments.mockResolvedValue(0)
    mockDeletePartitionedBatch.mockResolvedValue(0)
    mockDeleteWorkspaceRowsBatch.mockResolvedValue(0)
    mockFindByInboxId.mockResolvedValue(undefined)
    mockHasPartitionedWorkspaceRows.mockResolvedValue(false)
    mockHasWorkspaceRows.mockResolvedValue(false)
    mockInboxDisconnect.mockResolvedValue(undefined)
    mockListMessageConversationPage.mockResolvedValue([])
    mockListWithIntegrationsByWorkspace.mockResolvedValue([])
  })

  test("drains each registered direct workspace table once when batches are short", async () => {
    mockDeleteWorkspaceRowsBatch.mockResolvedValue(1)

    await expect(
      workspaceLifecycleService.purgeWorkspaceHeavyData({
        batchSize: 2,
        deadlineAt: deadlineAt(),
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(1)

    expect(mockDeletePartitionedBatch).toHaveBeenCalledOnce()
    expect(mockDeleteWorkspaceRowsBatch).toHaveBeenCalledOnce()
  })

  test("defers a partitioned table when a SKIP LOCKED drain leaves rows behind", async () => {
    mockHasPartitionedWorkspaceRows.mockResolvedValue(true)

    await expect(
      workspaceLifecycleService.purgeWorkspaceHeavyData({
        batchSize: 2,
        deadlineAt: deadlineAt(),
        workspaceId: "workspace-1",
      }),
    ).rejects.toBeInstanceOf(WorkspacePurgeIncompleteError)
  })

  test("counts rows deleted from a message hypertable page", async () => {
    mockListMessageConversationPage
      .mockResolvedValueOnce(["conversation-1"])
      .mockResolvedValue([])
    mockDeleteMessagesAndAttachments.mockResolvedValue(3)

    await expect(
      workspaceLifecycleService.purgeWorkspaceHeavyData({
        batchSize: 2,
        deadlineAt: deadlineAt(),
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(3)

    expect(mockDeleteMessagesAndAttachments).toHaveBeenCalledOnce()
  })
  test("disconnectWorkspaceChannels disconnects provider auth and marks the inbox disconnected", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)
    mockListWithIntegrationsByWorkspace.mockResolvedValue([
      {
        id: "inbox-1",
        workspaceId: "workspace-1",
        channel: "messenger",
        integrationMessenger: {
          id: "integration-1",
          auth: { token: "secret" },
        },
      },
    ])

    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const deleteWhere = vi.fn().mockResolvedValue(undefined)
    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: updateWhere })),
      })),
      delete: vi.fn(() => ({
        where: deleteWhere,
      })),
    }

    await expect(
      workspaceLifecycleService.disconnectWorkspaceChannels({
        integrations: {
          messenger: {
            disconnect,
            isRevokedTokenError: () => false,
          },
        },
        teardownLevel: "disconnect",
        reason: "workspace_purge",
        tx: tx as never,
        workspaceId: "workspace-1",
        ownerId: "owner-1",
      }),
    ).resolves.toEqual({ disconnected: 1, pendingReleases: [] })

    expect(disconnect).toHaveBeenCalledWith({ token: "secret" })
    expect(tx.update).toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalled()
    expect(mockInboxDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      reason: "workspace_purge",
      tx,
    })
  })

  test("disconnectWorkspaceChannels skips the provider disconnect when the auth row is already gone", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined)
    mockListWithIntegrationsByWorkspace.mockResolvedValue([
      {
        id: "inbox-1",
        workspaceId: "workspace-1",
        channel: "messenger",
        // integrationMessenger is absent, so there is no auth to disconnect with.
      },
    ])

    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }

    await workspaceLifecycleService.disconnectWorkspaceChannels({
      integrations: {
        messenger: {
          disconnect,
          isRevokedTokenError: () => false,
        },
      },
      teardownLevel: "disconnect",
      reason: "workspace_purge",
      tx: tx as never,
      workspaceId: "workspace-1",
      ownerId: "owner-1",
    })

    // No credentials → provider call is skipped, but the inbox is still retired.
    expect(disconnect).not.toHaveBeenCalled()
    expect(mockInboxDisconnect).toHaveBeenCalled()
  })

  test("disconnectWorkspaceChannels routes a connection-backed inbox through teardown.disconnect for a trial-expiry/purge reason", async () => {
    mockListWithIntegrationsByWorkspace.mockResolvedValue([
      {
        id: "inbox-1",
        workspaceId: "workspace-1",
        channel: "webchat",
      },
    ])
    mockFindByInboxId.mockResolvedValue({ id: "connection-1" })

    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }

    await workspaceLifecycleService.disconnectWorkspaceChannels({
      teardownLevel: "disconnect",
      reason: "trial_expired",
      tx: tx as never,
      workspaceId: "workspace-1",
      ownerId: "owner-1",
    })

    expect(mockConnectionTransition).toHaveBeenCalledWith({
      connectionId: "connection-1",
      event: "teardown.disconnect",
      reason: "trial_expired",
      ownerId: "owner-1",
      tx,
      pendingRelease: { current: null },
    })
    expect(mockInboxDisconnect).not.toHaveBeenCalled()
  })

  test("disconnectWorkspaceChannels routes a connection-backed inbox through teardown.pause for a tenant-suspension reason", async () => {
    mockListWithIntegrationsByWorkspace.mockResolvedValue([
      {
        id: "inbox-1",
        workspaceId: "workspace-1",
        channel: "webchat",
      },
    ])
    mockFindByInboxId.mockResolvedValue({ id: "connection-1" })

    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }

    await workspaceLifecycleService.disconnectWorkspaceChannels({
      teardownLevel: "pause",
      reason: "tenant_suspended",
      tx: tx as never,
      workspaceId: "workspace-1",
      ownerId: "owner-1",
    })

    expect(mockConnectionTransition).toHaveBeenCalledWith({
      connectionId: "connection-1",
      event: "teardown.pause",
      reason: "tenant_suspended",
      ownerId: "owner-1",
      tx,
      pendingRelease: { current: null },
    })
    expect(mockInboxDisconnect).not.toHaveBeenCalled()
  })

  test("disconnectWorkspaceChannels keeps teardown.pause with reason tenant_suspended even when the provider reports the auth as revoked", async () => {
    mockListWithIntegrationsByWorkspace.mockResolvedValue([
      {
        id: "inbox-1",
        workspaceId: "workspace-1",
        channel: "webchat",
        integrationWebchat: {
          id: "integration-1",
          auth: { token: "secret" },
        },
      },
    ])
    mockFindByInboxId.mockResolvedValue({ id: "connection-1" })

    const disconnect = vi.fn().mockRejectedValue(new Error("revoked"))

    const tx = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    }

    await workspaceLifecycleService.disconnectWorkspaceChannels({
      integrations: {
        webchat: {
          disconnect,
          isRevokedTokenError: () => true,
        },
      },
      teardownLevel: "pause",
      reason: "tenant_suspended",
      tx: tx as never,
      workspaceId: "workspace-1",
      ownerId: "owner-1",
    })

    expect(mockConnectionTransition).toHaveBeenCalledWith({
      connectionId: "connection-1",
      event: "teardown.pause",
      reason: "tenant_suspended",
      ownerId: "owner-1",
      tx,
      pendingRelease: { current: null },
    })
    expect(mockInboxDisconnect).not.toHaveBeenCalled()
  })
})
