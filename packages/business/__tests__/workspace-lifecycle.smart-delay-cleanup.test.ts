import { beforeEach, describe, expect, test, vi } from "vitest"

const cancelActiveForWorkspace = vi.fn()
const queueRemove = vi.fn()
const loggerWarn = vi.fn()

vi.mock("@chatbotx.io/worker-config", () => ({
  integrationQueue: { remove: queueRemove },
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: loggerWarn },
}))

vi.mock("../src/smart-delay/service", () => ({
  smartDelayService: { cancelActiveForWorkspace },
}))

const { cancelSmartDelaysForWorkspace, SMART_DELAY_CANCEL_BATCH_SIZE } =
  await import("../src/workspace-lifecycle/smart-delay-cleanup")

const rowsOfSize = (size: number, offset = 0) =>
  Array.from({ length: size }, (_, index) => ({
    id: `row-${offset + index}`,
    triggerAt: new Date(`2026-07-16T00:0${(index % 9) + 1}:00.000Z`),
  }))

describe("cancelSmartDelaysForWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queueRemove.mockResolvedValue(undefined)
  })

  test("cancels nothing and touches no queue when the workspace has no live rows", async () => {
    cancelActiveForWorkspace.mockResolvedValueOnce([])

    await expect(
      cancelSmartDelaysForWorkspace({ workspaceId: "workspace-1" }),
    ).resolves.toBe(0)

    expect(cancelActiveForWorkspace).toHaveBeenCalledOnce()
    expect(queueRemove).not.toHaveBeenCalled()
  })

  test("removes the deterministic delayed job for every canceled row", async () => {
    cancelActiveForWorkspace.mockResolvedValueOnce([
      { id: "row-1", triggerAt: new Date("2026-07-16T00:01:00.000Z") },
    ])

    await expect(
      cancelSmartDelaysForWorkspace({ workspaceId: "workspace-1" }),
    ).resolves.toBe(1)

    expect(queueRemove).toHaveBeenCalledWith(
      `smart-delay-row-1-${new Date("2026-07-16T00:01:00.000Z").getTime()}`,
    )
  })

  test("keeps draining while batches come back full", async () => {
    cancelActiveForWorkspace
      .mockResolvedValueOnce(rowsOfSize(SMART_DELAY_CANCEL_BATCH_SIZE))
      .mockResolvedValueOnce(rowsOfSize(3, SMART_DELAY_CANCEL_BATCH_SIZE))

    await expect(
      cancelSmartDelaysForWorkspace({ workspaceId: "workspace-1" }),
    ).resolves.toBe(SMART_DELAY_CANCEL_BATCH_SIZE + 3)

    expect(cancelActiveForWorkspace).toHaveBeenCalledTimes(2)
    expect(cancelActiveForWorkspace).toHaveBeenLastCalledWith({
      limit: SMART_DELAY_CANCEL_BATCH_SIZE,
      workspaceId: "workspace-1",
    })
  })

  test("still reports the cancellation when removing the delayed job fails", async () => {
    cancelActiveForWorkspace.mockResolvedValueOnce([
      { id: "row-1", triggerAt: new Date("2026-07-16T00:01:00.000Z") },
    ])
    queueRemove.mockRejectedValueOnce(new Error("redis down"))

    // The row is already canceled, so a surviving job is a no-op when it wakes:
    // removal is cleanup, never correctness.
    await expect(
      cancelSmartDelaysForWorkspace({ workspaceId: "workspace-1" }),
    ).resolves.toBe(1)
  })
})
