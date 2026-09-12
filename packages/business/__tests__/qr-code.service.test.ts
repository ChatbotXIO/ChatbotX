import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  ilike: vi.fn((...args: unknown[]) => ({ ilike: args })),
  isUniqueViolationError: vi.fn(() => false),
  insertValues: vi.fn(),
  insert: vi.fn(),
  updateSet: vi.fn(),
  update: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  listWhere: vi.fn(),
  flowExists: vi.fn(),
}))

vi.mock("../src/flow/service", () => ({
  flowService: { exists: mocks.flowExists },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: mocks.and,
  db: {
    insert: mocks.insert,
    update: mocks.update,
    query: {
      reflinkModel: { findFirst: mocks.findFirst },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: mocks.listWhere,
        })),
      })),
    })),
    $count: mocks.count,
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
  mocks.flowExists.mockResolvedValue(true)
  mocks.withCache.mockImplementation(
    async (_key: string, fn: () => unknown) => await fn(),
  )
  mocks.findFirst.mockResolvedValue(undefined)
  mocks.count.mockResolvedValue(0)
  mocks.listWhere.mockReturnValue({
    orderBy: vi.fn(() => ({
      limit: vi.fn(() => ({
        offset: vi.fn(() => Promise.resolve([])),
      })),
    })),
  })
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

  test("rejects when flowId does not belong to the workspace", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      qrCodeService.create({
        workspaceId: "ws-1",
        data: { size: 256, name: "my-code", flowId: "other-workspace-flow" },
        duplicateNameMessage: "Name already exists",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "flowId",
    })

    expect(mocks.insertValues).not.toHaveBeenCalled()
  })
})

describe("qrCodeService.update", () => {
  test("returns the updated row scoped to workspace, id, and the qrCode type", async () => {
    mocks.findFirst.mockResolvedValue({ id: "qr-1", qrStyles: null })
    const returning = vi
      .fn()
      .mockResolvedValue([{ id: "qr-1", name: "qr_renamed" }])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    mocks.update.mockReturnValue({ set })

    const result = await qrCodeService.update({
      workspaceId: "ws-1",
      id: "qr-1",
      data: { name: "renamed" },
      duplicateNameMessage: "Name already exists",
    })

    expect(result).toEqual({ id: "qr-1", name: "qr_renamed" })
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ name: "qr_renamed" }),
    )
  })

  test("rejects when flowId does not belong to the workspace", async () => {
    mocks.findFirst.mockResolvedValue({ id: "qr-1", qrStyles: null })
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      qrCodeService.update({
        workspaceId: "ws-1",
        id: "qr-1",
        data: { flowId: "other-workspace-flow" },
        duplicateNameMessage: "Name already exists",
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "flowId",
    })

    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe("qrCodeService.list — scoping and cache tags", () => {
  test("list scopes its cache tag to the workspace's qr-codes tag", async () => {
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

  test("list filters by workspaceId and the qrCode type discriminator", async () => {
    await qrCodeService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    // `and(...)` is mocked to capture its args verbatim; `eq(...)` likewise.
    // Asserting the raw `and` call is what actually runs the query-building
    // closure inside `withCache`, unlike stubbing `withCache` itself to
    // resolve immediately.
    const andArgs = mocks.and.mock.calls[0] as {
      eq: [unknown, unknown]
    }[]
    const eqValues = andArgs
      .filter((arg): arg is { eq: [unknown, unknown] } => Boolean(arg))
      .map((arg) => arg.eq[1])
    expect(eqValues).toEqual(["ws-1", "qrCode"])
  })
})

describe("qrCodeService.find", () => {
  // Deliberately uncached (see the service) — the public, unauthenticated QR
  // landing page reads through this method directly, so a cache here would
  // let a renamed QR code redirect scans to the old destination for up to an
  // hour. The authenticated builder edit page caches around this call
  // instead, in `findQrCode` (apps/builder/src/features/qr-codes/queries).
  test("does not cache — reads straight from the database", async () => {
    await qrCodeService.find({ workspaceId: "ws-1", id: "qr-1" })

    expect(mocks.withCache).not.toHaveBeenCalled()
  })

  test("filters by workspaceId, id, and the qrCode type discriminator", async () => {
    await qrCodeService.find({ workspaceId: "ws-1", id: "qr-1" })

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "qr-1",
        workspaceId: "ws-1",
        type: "qrCode",
      },
    })
  })
})
