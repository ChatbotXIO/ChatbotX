import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteById: vi.fn(),
  deleteObject: vi.fn(),
  listBatch: vi.fn(),
  purgeTimeouts: vi.fn(),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  fileRepository: {
    deleteById: mocks.deleteById,
    listWorkspaceExportsBatch: mocks.listBatch,
  },
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: { deleteObject: mocks.deleteObject },
}))

vi.mock("../src/workspace-lifecycle/purge-batch", () => ({
  withPurgeTimeouts: async (props: {
    fn: (tx: unknown) => Promise<unknown>
    table: string
    workspaceId: string
  }) => {
    mocks.purgeTimeouts(props.table, props.workspaceId)
    return await props.fn({ tx: true })
  },
}))

vi.mock("../src/logger", () => ({ logger: { warn: mocks.warn } }))

const { exportFileService } = await import("../src/export-file/service")

const file = (id: string) => ({ id, path: `exports/${id}.csv` })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteObject.mockResolvedValue(undefined)
  mocks.deleteById.mockResolvedValue(undefined)
})

describe("exportFileService.purgeWorkspace", () => {
  test("deletes each stored object before its row and ends on a short batch", async () => {
    mocks.listBatch.mockResolvedValueOnce([file("1"), file("2")])

    await expect(
      exportFileService.purgeWorkspace({ batchSize: 5, workspaceId: "ws-1" }),
    ).resolves.toEqual({ complete: true, deleted: 2 })

    expect(mocks.listBatch).toHaveBeenCalledWith(
      { limit: 5, workspaceId: "ws-1" },
      { tx: true },
    )
    // List and row delete both run under the purge timeouts for the File table.
    expect(mocks.purgeTimeouts).toHaveBeenCalledWith("File", "ws-1")
    expect(mocks.purgeTimeouts).toHaveBeenCalledTimes(3)
    expect(mocks.deleteObject.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteById.mock.invocationCallOrder[0] ?? 0,
    )
    expect(mocks.deleteById).toHaveBeenCalledWith({ id: "2" }, { tx: true })
  })

  test("a workspace with no export files is complete at once", async () => {
    mocks.listBatch.mockResolvedValueOnce([])

    await expect(
      exportFileService.purgeWorkspace({ workspaceId: "ws-1" }),
    ).resolves.toEqual({ complete: true, deleted: 0 })
    expect(mocks.deleteObject).not.toHaveBeenCalled()
  })

  test("keeps going while batches come back full", async () => {
    mocks.listBatch
      .mockResolvedValueOnce([file("1"), file("2")])
      .mockResolvedValueOnce([file("3")])

    await expect(
      exportFileService.purgeWorkspace({ batchSize: 2, workspaceId: "ws-1" }),
    ).resolves.toEqual({ complete: true, deleted: 3 })
    expect(mocks.listBatch).toHaveBeenCalledTimes(2)
  })

  test("a failed object delete keeps its row and leaves the pass incomplete", async () => {
    mocks.listBatch.mockResolvedValueOnce([file("1"), file("2")])
    mocks.deleteObject
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("storage down"))

    await expect(
      exportFileService.purgeWorkspace({ batchSize: 5, workspaceId: "ws-1" }),
    ).resolves.toEqual({ complete: false, deleted: 1 })

    expect(mocks.deleteById).toHaveBeenCalledTimes(1)
    expect(mocks.deleteById).toHaveBeenCalledWith({ id: "1" }, { tx: true })
    expect(mocks.warn).toHaveBeenCalledTimes(1)
  })

  test("stops after the batch limit and reports the rest as incomplete", async () => {
    mocks.listBatch.mockResolvedValue([file("1"), file("2")])

    await expect(
      exportFileService.purgeWorkspace({
        batchSize: 2,
        maxBatches: 3,
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ complete: false, deleted: 6 })
    expect(mocks.listBatch).toHaveBeenCalledTimes(3)
  })
})

describe("exportFileService.purgeWorkspace — deadline", () => {
  test("a deadline already passed stops before any statement", async () => {
    await expect(
      exportFileService.purgeWorkspace({
        deadlineAt: Date.now() - 1,
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ complete: false, deleted: 0 })

    expect(mocks.listBatch).not.toHaveBeenCalled()
  })

  test("a deadline that passes mid-batch stops before the next object", async () => {
    const now = vi.spyOn(Date, "now")
    now.mockReturnValueOnce(0) // before the batch
    now.mockReturnValueOnce(0) // before the first object
    now.mockReturnValue(10_000) // before the second
    mocks.listBatch.mockResolvedValueOnce([file("1"), file("2")])

    await expect(
      exportFileService.purgeWorkspace({
        batchSize: 5,
        deadlineAt: 5000,
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ complete: false, deleted: 1 })

    expect(mocks.deleteObject).toHaveBeenCalledTimes(1)
    now.mockRestore()
  })
})
