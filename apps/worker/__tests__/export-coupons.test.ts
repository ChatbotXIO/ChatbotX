import { PassThrough } from "node:stream"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  chunks: [] as string[],
  createUpload: vi.fn(),
  listCouponsForExportPage: vi.fn(),
  updateExportFile: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  couponService: {
    listCouponsForExportPage: (...args: unknown[]) =>
      mocks.listCouponsForExportPage(...args),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  couponRepository: {
    updateExportFile: (...args: unknown[]) => mocks.updateExportFile(...args),
  },
}))

vi.mock("@chatbotx.io/filesystem/node-upload", () => ({
  createUpload: (...args: unknown[]) => mocks.createUpload(...args),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  loopableItemsCount: 2,
}))

const { exportCoupons } = await import("../src/default/handlers/export-coupons")

const row = (id: string) => ({
  id,
  topicName: `Topic ${id}`,
  code: `CODE-${id}`,
  issueStatus: id === "2" ? "unpublished" : "published",
  createdAt: new Date(`2026-01-0${id}T00:00:00.000Z`),
})

const data = {
  workspaceId: "workspace-1",
  requestedUserId: "user-1",
  fileId: "file-1",
  outputPath: "exports/coupons.csv",
  outputFormat: "csv" as const,
  filter: {},
}

const setupUpload = (rejectDone = false) => {
  mocks.chunks = []
  const stream = new PassThrough()
  stream.on("data", (chunk) => {
    mocks.chunks.push(chunk.toString())
  })
  const done = new Promise<void>((resolve, reject) => {
    stream.on("finish", () => {
      if (rejectDone) {
        reject(new Error("upload failed"))
        return
      }
      resolve()
    })
    stream.on("error", reject)
  })
  mocks.createUpload.mockReturnValue({ stream, done })
}

describe("exportCoupons", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupUpload()
  })

  test("exports coupons in id chunks and scopes file updates to the workspace", async () => {
    mocks.listCouponsForExportPage
      .mockResolvedValueOnce([row("1"), row("2")])
      .mockResolvedValueOnce([row("3")])
    mocks.updateExportFile.mockResolvedValue(undefined)

    await exportCoupons(data)

    expect(mocks.listCouponsForExportPage).toHaveBeenNthCalledWith(1, {
      workspaceId: "workspace-1",
      filter: {
        topicId: undefined,
        issueStatus: undefined,
        usageStatus: undefined,
        search: undefined,
      },
      lastId: null,
      limit: 2,
    })
    expect(mocks.listCouponsForExportPage).toHaveBeenNthCalledWith(2, {
      workspaceId: "workspace-1",
      filter: {
        topicId: undefined,
        issueStatus: undefined,
        usageStatus: undefined,
        search: undefined,
      },
      lastId: "2",
      limit: 2,
    })
    expect(mocks.updateExportFile).toHaveBeenCalledWith({
      fileId: "file-1",
      workspaceId: "workspace-1",
      meta: { totalRecords: 2 },
    })
    expect(mocks.updateExportFile).toHaveBeenCalledWith({
      fileId: "file-1",
      workspaceId: "workspace-1",
      meta: { totalRecords: 3 },
    })
    expect(mocks.updateExportFile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fileId: "file-1",
        workspaceId: "workspace-1",
        status: "uploaded",
        meta: { totalRecords: 3 },
      }),
    )
    expect(mocks.chunks.join("")).toContain('"Topic 1","CODE-1","Published"')
  })

  test("marks an empty export as failed", async () => {
    mocks.listCouponsForExportPage.mockResolvedValueOnce([])
    mocks.updateExportFile.mockResolvedValue(undefined)

    await exportCoupons(data)

    expect(mocks.updateExportFile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fileId: "file-1",
        workspaceId: "workspace-1",
        status: "failed",
        meta: { totalRecords: 0 },
      }),
    )
  })

  test("marks the export failed when upload completion rejects", async () => {
    setupUpload(true)
    mocks.listCouponsForExportPage.mockResolvedValueOnce([row("1")])
    mocks.updateExportFile.mockResolvedValue(undefined)

    await expect(exportCoupons(data)).rejects.toThrow("upload failed")

    expect(mocks.updateExportFile).toHaveBeenLastCalledWith({
      fileId: "file-1",
      workspaceId: "workspace-1",
      status: "failed",
      meta: { totalRecords: 1 },
    })
  })
})
