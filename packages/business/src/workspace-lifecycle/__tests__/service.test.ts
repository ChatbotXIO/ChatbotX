import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockListWithIntegrationsByWorkspace } = vi.hoisted(() => ({
  mockListWithIntegrationsByWorkspace: vi.fn(),
}))

vi.mock("../../inbox/service", () => ({
  inboxService: {
    listWithIntegrationsByWorkspace: mockListWithIntegrationsByWorkspace,
  },
}))

const { workspaceLifecycleService } = await import("../service")

describe("workspaceLifecycleService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
        tx: tx as never,
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(1)

    expect(disconnect).toHaveBeenCalledWith({ token: "secret" })
    expect(tx.update).toHaveBeenCalled()
    expect(tx.delete).toHaveBeenCalled()
  })
})
