import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  $count: vi.fn(),
}))

vi.mock("../src/client", () => ({
  db: {},
  eq: mocks.eq,
  and: mocks.and,
}))

vi.mock("../src/schema", () => ({
  workspaceApiTokenModel: {
    id: "id",
    workspaceId: "workspaceId-column",
    tokenHash: "tokenHash-column",
    name: "name-column",
    permission: "permission-column",
    tokenPrefix: "tokenPrefix-column",
  },
}))

const { workspaceApiTokenRepository } = await import(
  "../src/repositories/workspace-api-token/repository"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("workspaceApiTokenRepository.findByTokenHash", () => {
  test("returns the row when a token hash matches", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValue({ id: "t-1", workspaceId: "ws-1" })
    const tx = { query: { workspaceApiTokenModel: { findFirst } } } as never

    await expect(
      workspaceApiTokenRepository.findByTokenHash("hash-1", tx),
    ).resolves.toEqual({ id: "t-1", workspaceId: "ws-1" })
    expect(findFirst).toHaveBeenCalledWith({ where: { tokenHash: "hash-1" } })
  })

  test("returns null when no row matches", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined)
    const tx = { query: { workspaceApiTokenModel: { findFirst } } } as never

    await expect(
      workspaceApiTokenRepository.findByTokenHash("hash-1", tx),
    ).resolves.toBeNull()
  })
})

describe("workspaceApiTokenRepository.listByWorkspaceId", () => {
  test("lists tokens ordered by createdAt desc", async () => {
    const rows = [{ id: "t-2" }, { id: "t-1" }]
    const findMany = vi.fn().mockResolvedValue(rows)
    const tx = { query: { workspaceApiTokenModel: { findMany } } } as never

    await expect(
      workspaceApiTokenRepository.listByWorkspaceId("ws-1", tx),
    ).resolves.toEqual(rows)
    expect(findMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1" },
      orderBy: { createdAt: "desc" },
    })
  })
})

describe("workspaceApiTokenRepository.countByWorkspaceId", () => {
  test("counts rows scoped to the workspace", async () => {
    mocks.$count.mockResolvedValue(3)
    const tx = { $count: mocks.$count } as never

    await expect(
      workspaceApiTokenRepository.countByWorkspaceId("ws-1", tx),
    ).resolves.toBe(3)
    expect(mocks.$count).toHaveBeenCalledWith(
      {
        id: "id",
        workspaceId: "workspaceId-column",
        tokenHash: "tokenHash-column",
        name: "name-column",
        permission: "permission-column",
        tokenPrefix: "tokenPrefix-column",
      },
      { eq: ["workspaceId-column", "ws-1"] },
    )
  })
})

describe("workspaceApiTokenRepository.deleteByIdForWorkspace", () => {
  test("returns true and deletes when id and workspaceId both match", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "t-1" }])
    const where = vi.fn(() => ({ returning }))
    const deleteFn = vi.fn(() => ({ where }))
    const tx = { delete: deleteFn } as never

    await expect(
      workspaceApiTokenRepository.deleteByIdForWorkspace(
        { id: "t-1", workspaceId: "ws-1" },
        tx,
      ),
    ).resolves.toBe(true)

    expect(mocks.and).toHaveBeenCalledWith(
      { eq: ["id", "t-1"] },
      { eq: ["workspaceId-column", "ws-1"] },
    )
  })

  test("returns false when the id belongs to a different workspace", async () => {
    const returning = vi.fn().mockResolvedValue([])
    const where = vi.fn(() => ({ returning }))
    const deleteFn = vi.fn(() => ({ where }))
    const tx = { delete: deleteFn } as never

    await expect(
      workspaceApiTokenRepository.deleteByIdForWorkspace(
        { id: "t-1", workspaceId: "ws-other" },
        tx,
      ),
    ).resolves.toBe(false)
  })
})

describe("workspaceApiTokenRepository.insert", () => {
  test("inserts and returns the new row with name/permission/prefix", async () => {
    const insertedRow = {
      id: "t-1",
      workspaceId: "ws-1",
      tokenHash: "hash-1",
      name: "My token",
      permission: "full",
      tokenPrefix: "cbx_ws_abcd",
    }
    const returning = vi.fn().mockResolvedValue([insertedRow])
    const values = vi.fn(() => ({ returning }))
    const insert = vi.fn(() => ({ values }))
    const tx = { insert } as never

    await expect(
      workspaceApiTokenRepository.insert(
        {
          workspaceId: "ws-1",
          tokenHash: "hash-1",
          name: "My token",
          permission: "full",
          tokenPrefix: "cbx_ws_abcd",
        },
        tx,
      ),
    ).resolves.toEqual(insertedRow)

    expect(values).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tokenHash: "hash-1",
      name: "My token",
      permission: "full",
      tokenPrefix: "cbx_ws_abcd",
    })
  })
})
