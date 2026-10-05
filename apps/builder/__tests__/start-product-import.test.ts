import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  startProductImport: vi.fn(),
  fail: vi.fn(),
  add: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  importService: {
    startProductImport: mocks.startProductImport,
    fail: mocks.fail,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  DefaultJobAction: { runImport: "runImport" },
  defaultQueue: { add: mocks.add },
}))

const { startProductImportJob } = await import(
  "@/features/products/lib/start-product-import"
)

const input = {
  workspaceId: "ws-1",
  userId: null,
  fileId: "f1",
  format: "csv" as const,
  meta: { columnMap: { name: "Name" }, createMissingCategories: true },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("startProductImportJob", () => {
  test("creates the import row and queues one worker job per import", async () => {
    mocks.startProductImport.mockResolvedValueOnce({ id: "imp-1" })

    const result = await startProductImportJob(input)

    expect(mocks.startProductImport).toHaveBeenCalledWith(input)
    expect(mocks.add).toHaveBeenCalledWith(
      "runImport",
      { type: "runImport", data: { importId: "imp-1" } },
      { jobId: "import-products-imp-1" },
    )
    expect(result).toEqual({ importId: "imp-1" })
  })

  test("marks the import failed and rethrows when the queue is unavailable", async () => {
    mocks.startProductImport.mockResolvedValueOnce({ id: "imp-2" })
    mocks.add.mockRejectedValueOnce(new Error("redis down"))

    await expect(startProductImportJob(input)).rejects.toThrow("redis down")

    expect(mocks.fail).toHaveBeenCalledWith(
      "imp-2",
      "Unable to queue product import",
    )
  })

  test("does not queue anything when validation of the file fails", async () => {
    mocks.startProductImport.mockRejectedValueOnce(
      new Error("Product import file not found"),
    )

    await expect(startProductImportJob(input)).rejects.toThrow(
      "Product import file not found",
    )

    expect(mocks.add).not.toHaveBeenCalled()
  })
})
