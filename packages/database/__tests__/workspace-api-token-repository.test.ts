import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
}))

vi.mock("../src/client", () => ({
  db: {},
  eq: mocks.eq,
}))

vi.mock("../src/schema", () => ({
  workspaceApiTokenModel: {
    id: "id",
    workspaceId: "workspaceId-column",
    tokenHash: "tokenHash-column",
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

describe("workspaceApiTokenRepository.existsByWorkspaceId", () => {
  test("true when a row exists, selecting only id", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "t-1" })
    const tx = { query: { workspaceApiTokenModel: { findFirst } } } as never

    await expect(
      workspaceApiTokenRepository.existsByWorkspaceId("ws-1", tx),
    ).resolves.toBe(true)
    expect(findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1" },
      columns: { id: true },
    })
  })

  test("false when no row exists", async () => {
    const findFirst = vi.fn().mockResolvedValue(undefined)
    const tx = { query: { workspaceApiTokenModel: { findFirst } } } as never

    await expect(
      workspaceApiTokenRepository.existsByWorkspaceId("ws-1", tx),
    ).resolves.toBe(false)
  })
})

describe("workspaceApiTokenRepository.deleteByWorkspaceId", () => {
  test("deletes rows filtered by workspaceId", async () => {
    const where = vi.fn(async () => undefined)
    const deleteFn = vi.fn(() => ({ where }))
    const tx = { delete: deleteFn } as never

    await workspaceApiTokenRepository.deleteByWorkspaceId("ws-1", tx)

    expect(deleteFn).toHaveBeenCalledWith({
      id: "id",
      workspaceId: "workspaceId-column",
      tokenHash: "tokenHash-column",
    })
    expect(mocks.eq).toHaveBeenCalledWith("workspaceId-column", "ws-1")
    expect(where).toHaveBeenCalledWith({
      eq: ["workspaceId-column", "ws-1"],
    })
  })
})

describe("workspaceApiTokenRepository.insert", () => {
  test("inserts the workspaceId/tokenHash pair", async () => {
    const values = vi.fn(async () => undefined)
    const insert = vi.fn(() => ({ values }))
    const tx = { insert } as never

    await workspaceApiTokenRepository.insert(
      { workspaceId: "ws-1", tokenHash: "hash-1" },
      tx,
    )

    expect(insert).toHaveBeenCalledWith({
      id: "id",
      workspaceId: "workspaceId-column",
      tokenHash: "tokenHash-column",
    })
    expect(values).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      tokenHash: "hash-1",
    })
  })
})
