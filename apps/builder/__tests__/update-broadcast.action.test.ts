// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDbUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockFindOrFail,
  mockEq,
  mockRecordAuditLog,
} = vi.hoisted(() => {
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
  const mockUpdateSet = vi.fn()
  mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
  const mockDbUpdate = vi.fn()
  mockDbUpdate.mockReturnValue({ set: mockUpdateSet })

  return {
    mockDbUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockFindOrFail: vi.fn(),
    mockEq: vi.fn((col: unknown, val: unknown) => ({ __eq: [col, val] })),
    mockRecordAuditLog: vi.fn(),
  }
})

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: (...args: unknown[]) => mockRecordAuditLog(...args) },
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mockDbUpdate,
  },
  eq: mockEq,
  findOrFail: mockFindOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { id: "broadcastModelId" },
}))

const { updateBroadcast } = await import(
  "../src/features/broadcasts/actions/update-broadcast.action"
)

const WORKSPACE_ID = "ws-1"
const BROADCAST_ID = "bc-1"

describe("updateBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockDbUpdate.mockReturnValue({ set: mockUpdateSet })
    mockUpdateWhere.mockResolvedValue(undefined)
  })

  test("propagates error when findOrFail throws (broadcast not found)", async () => {
    const notFoundError = new Error("Not found")
    mockFindOrFail.mockRejectedValue(notFoundError)

    await expect(
      updateBroadcast(
        { workspaceId: WORKSPACE_ID, id: BROADCAST_ID },
        { name: "New Name" },
      ),
    ).rejects.toThrow("Not found")
  })

  test("calls db.update with parsedInput after finding broadcast", async () => {
    const mockBroadcast = {
      id: BROADCAST_ID,
      workspaceId: WORKSPACE_ID,
      name: "Broadcast",
    }
    mockFindOrFail.mockResolvedValue(mockBroadcast)

    await updateBroadcast(
      { workspaceId: WORKSPACE_ID, id: BROADCAST_ID },
      { name: "Updated Name" },
    )

    expect(mockFindOrFail).toHaveBeenCalledOnce()
    expect(mockFindOrFail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: BROADCAST_ID,
          workspaceId: WORKSPACE_ID,
        }),
      }),
    )
    expect(mockDbUpdate).toHaveBeenCalledOnce()
    expect(mockUpdateSet).toHaveBeenCalledWith({ name: "Updated Name" })
    expect(mockRecordAuditLog).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      action: "update",
      detail: `updated a broadcast (#${BROADCAST_ID})`,
    })
  })

  test("scopes findOrFail by workspaceId to prevent cross-workspace access", async () => {
    const mockBroadcast = {
      id: BROADCAST_ID,
      workspaceId: WORKSPACE_ID,
      name: "Broadcast",
    }
    mockFindOrFail.mockResolvedValue(mockBroadcast)

    await updateBroadcast(
      { workspaceId: "other-ws", id: BROADCAST_ID },
      { name: "Name" },
    )

    const findOrFailArgs = mockFindOrFail.mock.calls[0]?.[0] as {
      where: { workspaceId: string }
    }
    expect(findOrFailArgs.where.workspaceId).toBe("other-ws")
  })

  test("uses eq(broadcastModel.id, broadcast.id) in the where clause", async () => {
    const mockBroadcast = {
      id: BROADCAST_ID,
      workspaceId: WORKSPACE_ID,
      name: "Broadcast",
    }
    mockFindOrFail.mockResolvedValue(mockBroadcast)

    await updateBroadcast(
      { workspaceId: WORKSPACE_ID, id: BROADCAST_ID },
      { name: "Name" },
    )

    expect(mockEq).toHaveBeenCalledWith(expect.anything(), mockBroadcast.id)
    expect(mockUpdateWhere).toHaveBeenCalledWith(
      expect.objectContaining({ __eq: expect.any(Array) }),
    )
  })

  test("returns undefined on success", async () => {
    const mockBroadcast = {
      id: BROADCAST_ID,
      workspaceId: WORKSPACE_ID,
      name: "Broadcast",
    }
    mockFindOrFail.mockResolvedValue(mockBroadcast)

    const result = await updateBroadcast(
      { workspaceId: WORKSPACE_ID, id: BROADCAST_ID },
      { name: "Final Name" },
    )

    expect(result).toBeUndefined()
  })
})
