import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isUniqueViolationError: vi.fn(() => false),
  insertValues: vi.fn(),
  insert: vi.fn(),
  findFirst: vi.fn(),
  select: vi.fn(),
  deleteWhere: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: {
    insert: mocks.insert,
    query: { reflinkModel: { findFirst: mocks.findFirst } },
    select: mocks.select,
    delete: vi.fn(() => ({ where: mocks.deleteWhere })),
  },
  desc: (...args: unknown[]) => ({ desc: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  reflinkModel: { id: "reflink.id", name: "reflink.name" },
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))

let nextId = 0
vi.mock("@chatbotx.io/utils", () => ({
  createId: () => `id-${nextId++}`,
}))

const { reflinkService } = await import("../src/reflink/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isUniqueViolationError.mockReturnValue(false)
  mocks.insert.mockReturnValue({ values: mocks.insertValues })
  mocks.insertValues.mockResolvedValue(undefined)
})

describe("reflinkService.create", () => {
  test("inserts with type refLink and a generated id", async () => {
    await reflinkService.create({
      workspaceId: "ws-1",
      data: { name: "my-link", url: "https://example.com" },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        type: "refLink",
        name: "my-link",
      }),
    )
  })

  test("maps a unique violation to a validation exception on name", async () => {
    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.insertValues.mockRejectedValue(new Error("duplicate key"))

    await expect(
      reflinkService.create({
        workspaceId: "ws-1",
        data: { name: "dup", url: "https://example.com" },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "name",
      message: "Name is already taken",
    })
  })

  test("rethrows a non-unique-violation error", async () => {
    const error = new Error("connection lost")
    mocks.isUniqueViolationError.mockReturnValue(false)
    mocks.insertValues.mockRejectedValue(error)

    await expect(
      reflinkService.create({
        workspaceId: "ws-1",
        data: { name: "ok", url: "https://example.com" },
      }),
    ).rejects.toThrow(error)
  })
})

describe("reflinkService.findRefLink", () => {
  test("scopes the lookup to workspaceId, id, and type refLink", async () => {
    mocks.findFirst.mockResolvedValue({ id: "rl-1" })

    await reflinkService.findRefLink({ workspaceId: "ws-1", id: "rl-1" })

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "rl-1", workspaceId: "ws-1", type: "refLink" },
    })
  })
})
