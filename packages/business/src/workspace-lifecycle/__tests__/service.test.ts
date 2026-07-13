import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDbExecute, mockListWithIntegrationsByWorkspace, mockSql } =
  vi.hoisted(() => {
    const sql = Object.assign(
      vi.fn(() => ({})),
      {
        raw: vi.fn((value: string) => value),
      },
    )

    return {
      mockDbExecute: vi.fn(),
      mockListWithIntegrationsByWorkspace: vi.fn(),
      mockSql: sql,
    }
  })

vi.mock("@chatbotx.io/database/client", () => ({
  db: { execute: mockDbExecute },
  sql: mockSql,
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
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

  test("purgeWorkspaceHeavyData drains each table until a short batch", async () => {
    mockDbExecute
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValue({ rowCount: 1 })

    const result = await workspaceLifecycleService.purgeWorkspaceHeavyData({
      workspaceId: "workspace-1",
      batchSize: 2,
    })

    expect(result).toBe(10)
    expect(mockDbExecute).toHaveBeenCalledTimes(9)
  })

  test("purgeWorkspaceHeavyData caps batches per table", async () => {
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
      callback()
      return 0 as unknown as ReturnType<typeof setTimeout>
    })
    mockDbExecute.mockResolvedValue({ rowCount: 1 })

    const result = await workspaceLifecycleService.purgeWorkspaceHeavyData({
      workspaceId: "workspace-1",
      batchSize: 1,
    })

    expect(result).toBe(16_000)
    expect(mockDbExecute).toHaveBeenCalledTimes(16_000)
    vi.restoreAllMocks()
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
