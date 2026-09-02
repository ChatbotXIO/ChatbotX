// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// Same chain-capture mock style as broadcast-draft-actions.test.ts: `clearMocks`
// wipes vi.fn() call history before each test, so capturing which client
// (`workspaceActionClient` vs `workspaceActionClientAllowExpired`) built each
// action has to land in a plain array recorded once at module-import time.
type Handler = (args: {
  bindArgsParsedInputs: string[]
  parsedInput?: unknown
}) => Promise<unknown>

type CapturedAction = { client: "normal" | "allowExpired"; handler: Handler }

const capturedActions: CapturedAction[] = []

function makeChainSpy(client: CapturedAction["client"]) {
  const bindArgsSchemas = vi.fn()
  const inputSchema = vi.fn()
  const action = vi.fn()
  const chain = { bindArgsSchemas, inputSchema, action }
  bindArgsSchemas.mockReturnValue(chain)
  inputSchema.mockReturnValue(chain)
  action.mockImplementation((handler: Handler) => {
    capturedActions.push({ client, handler })
    return handler
  })
  return chain
}

const workspaceActionClientChain = makeChainSpy("normal")
const workspaceActionClientAllowExpiredChain = makeChainSpy("allowExpired")

const {
  moveToDraft,
  stopSending,
  resumeSending,
  softDeleteBroadcasts,
  recordAuditLog,
} = vi.hoisted(() => ({
  moveToDraft: vi.fn(),
  stopSending: vi.fn(),
  resumeSending: vi.fn(),
  softDeleteBroadcasts: vi.fn(),
  recordAuditLog: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: workspaceActionClientChain,
  workspaceActionClientAllowExpired: workspaceActionClientAllowExpiredChain,
}))
vi.mock("@chatbotx.io/business", () => ({
  broadcastService: {
    moveToDraft,
    stopSending,
    resumeSending,
    softDeleteBroadcasts,
  },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: (...args: unknown[]) => recordAuditLog(...args) },
}))

await import("@/features/broadcasts/actions/move-broadcast-to-draft.action")
await import("@/features/broadcasts/actions/stop-broadcast.action")
await import("@/features/broadcasts/actions/resume-broadcast.action")
await import("@/features/broadcasts/actions/delete-broadcasts.action")
await import("@/features/broadcasts/actions/delete-broadcast.action")

const [
  { client: moveToDraftClient, handler: moveToDraftHandler },
  { client: stopClient, handler: stopHandler },
  { client: resumeClient, handler: resumeHandler },
  { client: bulkDeleteClient, handler: bulkDeleteHandler },
  { client: deleteClient, handler: deleteHandler },
] = capturedActions

beforeEach(() => {
  moveToDraft.mockReset()
  stopSending.mockReset()
  resumeSending.mockReset()
  softDeleteBroadcasts.mockReset()
  recordAuditLog.mockReset().mockResolvedValue(undefined)
})

describe("moveBroadcastToDraftAction", () => {
  test("is built from the strict workspaceActionClient", () => {
    expect(moveToDraftClient).toBe("normal")
  })

  test("delegates to broadcastService.moveToDraft with the bound ids and audits on success", async () => {
    moveToDraft.mockResolvedValue({ id: "b-1" })

    const result = await moveToDraftHandler({
      bindArgsParsedInputs: ["ws-1", "b-1"],
    })

    expect(moveToDraft).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-1",
    })
    expect(recordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "broadcast_moved_to_draft",
      detail: "moved broadcast (#b-1) to draft",
    })
    expect(result).toEqual({ id: "b-1" })
  })

  test("does not audit when the service throws", async () => {
    moveToDraft.mockRejectedValue(new Error("Broadcast is no longer scheduled"))

    await expect(
      moveToDraftHandler({ bindArgsParsedInputs: ["ws-1", "b-1"] }),
    ).rejects.toThrow("Broadcast is no longer scheduled")
    expect(recordAuditLog).not.toHaveBeenCalled()
  })
})

describe("stopBroadcastAction", () => {
  test("is built from workspaceActionClientAllowExpired so trial-expired workspaces can still stop a broadcast (repo invariant 14: cancel-type actions stay available after trial expiry)", () => {
    expect(stopClient).toBe("allowExpired")
  })

  test("delegates to broadcastService.stopSending with the bound ids and audits on success", async () => {
    stopSending.mockResolvedValue({ id: "b-2" })

    const result = await stopHandler({
      bindArgsParsedInputs: ["ws-1", "b-2"],
    })

    expect(stopSending).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-2",
    })
    expect(recordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "broadcast_stopped",
      detail: "stopped a broadcast (#b-2)",
    })
    expect(result).toEqual({ id: "b-2" })
  })

  test("does not audit when the service throws", async () => {
    stopSending.mockRejectedValue(new Error("Broadcast is not in progress"))

    await expect(
      stopHandler({ bindArgsParsedInputs: ["ws-1", "b-2"] }),
    ).rejects.toThrow("Broadcast is not in progress")
    expect(recordAuditLog).not.toHaveBeenCalled()
  })
})

describe("resumeBroadcastAction", () => {
  test("is built from the strict workspaceActionClient", () => {
    expect(resumeClient).toBe("normal")
  })

  test("delegates to broadcastService.resumeSending with the bound ids and audits on success", async () => {
    resumeSending.mockResolvedValue({ id: "b-3" })

    const result = await resumeHandler({
      bindArgsParsedInputs: ["ws-1", "b-3"],
    })

    expect(resumeSending).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      broadcastId: "b-3",
    })
    expect(recordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "broadcast_resumed",
      detail: "resumed a broadcast (#b-3)",
    })
    expect(result).toEqual({ id: "b-3" })
  })

  test("does not audit when the service throws", async () => {
    resumeSending.mockRejectedValue(new Error("Broadcast is not stopped"))

    await expect(
      resumeHandler({ bindArgsParsedInputs: ["ws-1", "b-3"] }),
    ).rejects.toThrow("Broadcast is not stopped")
    expect(recordAuditLog).not.toHaveBeenCalled()
  })
})

describe("deleteBroadcastsAction (bulk)", () => {
  test("is built from workspaceActionClientAllowExpired so trial-expired workspaces can still delete", () => {
    expect(bulkDeleteClient).toBe("allowExpired")
  })

  test("delegates to broadcastService.softDeleteBroadcasts with the workspace id and requested ids, and returns the counts", async () => {
    softDeleteBroadcasts.mockResolvedValue({
      deletedCount: 2,
      requestedCount: 3,
    })

    const result = await bulkDeleteHandler({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["b-1", "b-2", "b-3"] },
    })

    expect(softDeleteBroadcasts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["b-1", "b-2", "b-3"],
    })
    expect(result).toEqual({ deletedCount: 2, requestedCount: 3 })
  })

  test("audits with the deleted count when deletedCount > 0", async () => {
    softDeleteBroadcasts.mockResolvedValue({
      deletedCount: 2,
      requestedCount: 3,
    })

    await bulkDeleteHandler({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["b-1", "b-2", "b-3"] },
    })

    expect(recordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "delete",
      detail: "deleted 2 broadcast(s)",
    })
  })

  test("does not audit when deletedCount is 0 (all ids skipped)", async () => {
    softDeleteBroadcasts.mockResolvedValue({
      deletedCount: 0,
      requestedCount: 2,
    })

    await bulkDeleteHandler({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { ids: ["b-1", "b-2"] },
    })

    expect(recordAuditLog).not.toHaveBeenCalled()
  })

  test("does not audit when the service throws", async () => {
    softDeleteBroadcasts.mockRejectedValue(new Error("boom"))

    await expect(
      bulkDeleteHandler({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { ids: ["b-1"] },
      }),
    ).rejects.toThrow("boom")
    expect(recordAuditLog).not.toHaveBeenCalled()
  })
})

describe("deleteBroadcastAction (single) — counts + conditional audit", () => {
  test("is built from workspaceActionClientAllowExpired", () => {
    expect(deleteClient).toBe("allowExpired")
  })

  test("returns the counts from softDeleteBroadcasts", async () => {
    softDeleteBroadcasts.mockResolvedValue({
      deletedCount: 1,
      requestedCount: 1,
    })

    const result = await deleteHandler({
      bindArgsParsedInputs: ["ws-1", "b-1"],
    })

    expect(softDeleteBroadcasts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["b-1"],
    })
    expect(result).toEqual({ deletedCount: 1, requestedCount: 1 })
  })

  test("audits when deletedCount > 0", async () => {
    softDeleteBroadcasts.mockResolvedValue({
      deletedCount: 1,
      requestedCount: 1,
    })

    await deleteHandler({ bindArgsParsedInputs: ["ws-1", "b-1"] })

    expect(recordAuditLog).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      action: "delete",
      detail: "deleted 1 broadcast(s)",
    })
  })

  test("does not audit when deletedCount is 0 (e.g. broadcast is sending)", async () => {
    softDeleteBroadcasts.mockResolvedValue({
      deletedCount: 0,
      requestedCount: 1,
    })

    await deleteHandler({ bindArgsParsedInputs: ["ws-1", "b-1"] })

    expect(recordAuditLog).not.toHaveBeenCalled()
  })

  test("does not audit when the service throws", async () => {
    softDeleteBroadcasts.mockRejectedValue(new Error("boom"))

    await expect(
      deleteHandler({ bindArgsParsedInputs: ["ws-1", "b-1"] }),
    ).rejects.toThrow("boom")
    expect(recordAuditLog).not.toHaveBeenCalled()
  })
})
