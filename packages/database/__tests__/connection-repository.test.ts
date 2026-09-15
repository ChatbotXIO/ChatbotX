import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(async () => []),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  relationsFilterToSQL: vi.fn(() => ({})),
  $count: vi.fn(async () => 0),
}))

vi.mock("../src/client", () => ({
  db: {
    query: { connectionModel: { findMany: mocks.findMany } },
    $count: mocks.$count,
  },
  eq: mocks.eq,
  relationsFilterToSQL: mocks.relationsFilterToSQL,
}))

vi.mock("../src/schema", () => ({
  connectionModel: { id: "id" },
}))

vi.mock("../src/utils", () => ({
  getPaginationWithDefaults: vi.fn(() => ({ limit: 20, offset: 0 })),
}))

const { connectionRepository } = await import(
  "../src/repositories/connection/repository"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
})

describe("connectionRepository.list", () => {
  test("orders deterministically by kind, provider, displayName, id (T5)", async () => {
    await connectionRepository.list({ workspaceId: "workspace-1" })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          kind: "asc",
          provider: "asc",
          displayName: "asc",
          id: "asc",
        },
      }),
    )
  })
})
