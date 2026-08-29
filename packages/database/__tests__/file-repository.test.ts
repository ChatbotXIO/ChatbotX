import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// fileRepository — the ownership-proof read for a presigned-upload `File`
// row. Mocks `db` at the module boundary so the query is scoped exactly to
// `(id, workspaceId)` without touching a real database.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  select: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: { select: mocks.select },
  eq: mocks.eq,
}))

vi.mock("../src/schema", () => ({
  fileModel: { id: "id", workspaceId: "workspaceId" },
}))

const { fileRepository } = await import("../src/repositories/file/repository")

function chain(finalResult: unknown[]) {
  const builder = {
    from: vi.fn(() => builder),
    where: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(finalResult)),
  }
  return builder
}

describe("fileRepository.findByIdForWorkspace", () => {
  test("scopes the query to BOTH id and workspaceId", async () => {
    const row = { id: "file_1", workspaceId: "ws_1", path: "public/x" }
    const builder = chain([row])
    mocks.select.mockReturnValue(builder)

    const result = await fileRepository.findByIdForWorkspace({
      id: "file_1",
      workspaceId: "ws_1",
    })

    expect(result).toEqual(row)
    expect(mocks.eq).toHaveBeenCalledWith("id", "file_1")
    expect(mocks.eq).toHaveBeenCalledWith("workspaceId", "ws_1")
    expect(mocks.and).toHaveBeenCalled()
  })

  test("returns null when no row matches (e.g. a foreign fileId)", async () => {
    const builder = chain([])
    mocks.select.mockReturnValue(builder)

    const result = await fileRepository.findByIdForWorkspace({
      id: "file_evil",
      workspaceId: "ws_1",
    })

    expect(result).toBeNull()
  })
})
