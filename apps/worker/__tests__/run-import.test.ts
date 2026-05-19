import { beforeEach, describe, expect, test, vi } from "vitest"

const findFirst = vi.fn()
const updateSet = vi.fn()
const updateWhere = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      importModel: { findFirst: (...args: unknown[]) => findFirst(...args) },
    },
    update: () => ({
      set: (values: unknown) => {
        updateSet(values)
        return { where: (cond: unknown) => updateWhere(cond) }
      },
    }),
  },
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  importModel: { id: "Import.id" },
}))

const runImportPipeline = vi.fn()
vi.mock("../src/default/handlers/imports", () => ({
  runImportPipeline: (row: unknown, handler: unknown) =>
    runImportPipeline(row, handler),
  importHandlers: {
    contacts: { type: "contacts", __tag: "contacts-handler" },
  },
}))

vi.mock("../src/default/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const { runImport } = await import("../src/default/handlers/run-import")

beforeEach(() => {
  findFirst.mockReset()
  updateSet.mockReset()
  updateWhere.mockReset()
  runImportPipeline.mockReset()
})

describe("runImport dispatcher", () => {
  test("returns early when import row is missing", async () => {
    findFirst.mockResolvedValue(undefined)

    await runImport({ importId: "missing" })

    expect(runImportPipeline).not.toHaveBeenCalled()
    expect(updateSet).not.toHaveBeenCalled()
  })

  test("dispatches contacts handler when type is contacts", async () => {
    const row = {
      id: "imp-1",
      type: "contacts",
      format: "csv",
      file: { id: "file-1", path: "p", fileName: "f.csv" },
    }
    findFirst.mockResolvedValue(row)
    runImportPipeline.mockResolvedValue(undefined)

    await runImport({ importId: "imp-1" })

    expect(runImportPipeline).toHaveBeenCalledTimes(1)
    const [calledRow, calledHandler] = runImportPipeline.mock.calls[0] ?? []
    expect(calledRow).toEqual(row)
    expect(calledHandler).toMatchObject({ type: "contacts" })
    expect(updateSet).not.toHaveBeenCalled()
  })

  test("marks row failed when file is missing", async () => {
    findFirst.mockResolvedValue({
      id: "imp-x",
      type: "contacts",
      format: "csv",
      file: null,
    })

    await runImport({ importId: "imp-x" })

    expect(runImportPipeline).not.toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledTimes(1)
    expect(updateSet.mock.calls[0][0]).toMatchObject({
      status: "failed",
      errorMessage: "Associated file not found",
    })
  })

  test("marks row failed when type is unknown", async () => {
    findFirst.mockResolvedValue({
      id: "imp-2",
      type: "unknown",
      format: "csv",
      file: { id: "f", path: "p", fileName: "n" },
    })

    await runImport({ importId: "imp-2" })

    expect(runImportPipeline).not.toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalledTimes(1)
    expect(updateSet.mock.calls[0][0]).toMatchObject({
      status: "failed",
      errorMessage: expect.stringContaining("Unknown import type"),
    })
  })

  test("captures fatal pipeline error and marks row failed", async () => {
    findFirst.mockResolvedValue({
      id: "imp-3",
      type: "contacts",
      format: "csv",
      file: { id: "f", path: "p", fileName: "n" },
    })
    runImportPipeline.mockRejectedValue(new Error("boom"))

    await runImport({ importId: "imp-3" })

    expect(updateSet).toHaveBeenCalledTimes(1)
    expect(updateSet.mock.calls[0][0]).toMatchObject({
      status: "failed",
      errorMessage: "boom",
    })
  })
})
