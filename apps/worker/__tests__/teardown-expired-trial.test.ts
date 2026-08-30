import { beforeEach, describe, expect, test, vi } from "vitest"

const deactivateOwnerWorkspaces = vi.fn()
const markChannelsTornDown = vi.fn()
const recordAuditLog = vi.fn()
const error = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  userQuotaService: { markChannelsTornDown },
  workspaceLifecycleService: { deactivateOwnerWorkspaces },
}))
// Real AsyncLocalStorage context, isolated from `./service`'s Snowflake id
// generator dependency — this test only needs `record` to be observable, not
// a real enqueue.
vi.mock("@chatbotx.io/business/audit", async () => {
  const { AsyncLocalStorage } = await import("node:async_hooks")
  const storage = new AsyncLocalStorage<Record<string, unknown>>()
  return {
    SYSTEM_ACTOR: "system",
    withAuditContext: (actor: Record<string, unknown>, fn: () => unknown) =>
      storage.run(actor, fn),
    getAuditActor: () => storage.getStore(),
    auditService: { record: recordAuditLog },
  }
})
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ error }),
}))
vi.mock("../src/services/integrations", () => ({
  allIntegrations: ["integration"],
}))

const { teardownExpiredTrial } = await import(
  "../src/schedule/handlers/teardown-expired-trial"
)

beforeEach(() => {
  deactivateOwnerWorkspaces.mockReset()
  markChannelsTornDown.mockReset()
  recordAuditLog.mockReset()
  error.mockReset()
  deactivateOwnerWorkspaces.mockResolvedValue([])
  markChannelsTornDown.mockResolvedValue(undefined)
  recordAuditLog.mockResolvedValue(undefined)
})

describe("teardownExpiredTrial", () => {
  test("deactivates the owner and marks channels as torn down", async () => {
    await teardownExpiredTrial("owner-1")

    expect(deactivateOwnerWorkspaces).toHaveBeenCalledWith({
      ownerId: "owner-1",
      integrations: ["integration"],
      teardownLevel: "disconnect",
    })
    expect(markChannelsTornDown).toHaveBeenCalledWith("owner-1")
  })

  test("logs and rethrows teardown errors without marking the owner", async () => {
    const failure = new Error("failed")
    deactivateOwnerWorkspaces.mockRejectedValue(failure)

    await expect(teardownExpiredTrial("owner-1")).rejects.toBe(failure)

    expect(error).toHaveBeenCalledWith(
      { err: failure, ownerId: "owner-1" },
      "teardownExpiredTrial: owner teardown failed",
    )
    expect(markChannelsTornDown).not.toHaveBeenCalled()
  })

  test("emits one trial_torn_down audit row per torn-down workspace", async () => {
    deactivateOwnerWorkspaces.mockResolvedValue(["workspace-1", "workspace-2"])

    await teardownExpiredTrial("owner-1")

    expect(recordAuditLog).toHaveBeenCalledTimes(2)
    expect(recordAuditLog).toHaveBeenCalledWith({
      action: "trial_torn_down",
      detail: "Trial expired — channels disconnected",
      userId: "owner-1",
      workspaceId: "workspace-1",
      source: "schedule:teardownExpiredTrial",
    })
    expect(recordAuditLog).toHaveBeenCalledWith({
      action: "trial_torn_down",
      detail: "Trial expired — channels disconnected",
      userId: "owner-1",
      workspaceId: "workspace-2",
      source: "schedule:teardownExpiredTrial",
    })
  })

  test("emits no audit row when the owner has no workspaces to tear down", async () => {
    deactivateOwnerWorkspaces.mockResolvedValue([])

    await teardownExpiredTrial("owner-1")

    expect(recordAuditLog).not.toHaveBeenCalled()
  })
})
