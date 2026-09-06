import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  ilike: vi.fn((...args: unknown[]) => ({ ilike: args })),
  isUniqueViolationError: vi.fn(() => false),
  insertValues: vi.fn(),
  insert: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  db: {
    insert: mocks.insert,
    query: {
      reflinkModel: { findFirst: vi.fn() },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => ({
                offset: vi.fn(() => Promise.resolve([])),
              })),
            })),
          })),
        })),
      })),
    })),
    $count: vi.fn(() => Promise.resolve(0)),
  },
  eq: mocks.eq,
  ilike: mocks.ilike,
  isUniqueViolationError: mocks.isUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: {},
  reflinkModel: { name: "reflink.name" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: (input: { page: number; perPage: number }) => ({
    limit: input.perPage,
    offset: (input.page - 1) * input.perPage,
  }),
  likeContains: (value: string) => `%${value}%`,
  parseOrderBy: () => [],
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
  withCache: mocks.withCache,
}))

// `@chatbotx.io/utils` constructs a Snowflake singleton at module scope, which
// throws "Place ID 0 already in use" when `vi.resetModules()` re-evaluates it.
let nextId = 0
vi.mock("@chatbotx.io/utils", () => ({
  createId: () => `id-${nextId++}`,
}))

const { qrCodeService, qrCodeWorkspaceCacheTag } = await import(
  "../src/qr-code/qr-code.service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isUniqueViolationError.mockReturnValue(false)
  mocks.insert.mockReturnValue({ values: mocks.insertValues })
  mocks.insertValues.mockResolvedValue(undefined)
  mocks.withCache.mockImplementation(
    async (_key: string, fn: () => unknown) => await fn(),
  )
})

describe("qrCodeService.create", () => {
  test("prefixes the name with qr_ and writes qrStyles from size", async () => {
    await qrCodeService.create({
      workspaceId: "ws-1",
      data: { size: 256, name: "my-code", flowId: "flow-1" },
      duplicateNameMessage: "Name already exists",
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        type: "qrCode",
        name: "qr_my-code",
        qrStyles: { size: 256 },
        flowId: "flow-1",
      }),
    )
  })

  test("invalidates the qr-codes workspace cache tag on success", async () => {
    await qrCodeService.create({
      workspaceId: "ws-1",
      data: { size: 256, name: "my-code", flowId: "flow-1" },
      duplicateNameMessage: "Name already exists",
    })

    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      qrCodeWorkspaceCacheTag("ws-1"),
    ])
  })

  test("maps a unique violation to a validation exception carrying the passed message", async () => {
    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.insertValues.mockRejectedValue(new Error("duplicate key"))

    await expect(
      qrCodeService.create({
        workspaceId: "ws-1",
        data: { size: 256, name: "my-code", flowId: "flow-1" },
        duplicateNameMessage: "Name already exists",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "name",
      message: "Name already exists",
    })
  })

  test("returns the generated id", async () => {
    const result = await qrCodeService.create({
      workspaceId: "ws-1",
      data: { size: 256, name: "my-code", flowId: "flow-1" },
      duplicateNameMessage: "Name already exists",
    })

    expect(result).toEqual({ id: expect.any(String) })
  })
})

describe("qrCodeService.list / find cache tags", () => {
  test("list scopes its cache tag to the workspace's qr-codes tag", async () => {
    mocks.withCache.mockResolvedValue({ data: [], pageCount: 0 })

    await qrCodeService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    expect(mocks.withCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ tags: [qrCodeWorkspaceCacheTag("ws-1")] }),
    )
  })

  test("find scopes its cache tag to the workspace's qr-codes tag", async () => {
    mocks.withCache.mockResolvedValue(undefined)

    await qrCodeService.find({ workspaceId: "ws-1", id: "qr-1" })

    expect(mocks.withCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      expect.objectContaining({ tags: [qrCodeWorkspaceCacheTag("ws-1")] }),
    )
  })
})
