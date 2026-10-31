// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  returning: vi.fn(),
  findFirst: vi.fn(),
  invalidate: vi.fn(),
  execute: vi.fn(),
}))

class FakeDatabaseError extends Error {
  readonly cause: { code: string }

  constructor(cause: { code: string }) {
    super("query failed")
    this.cause = cause
  }
}

// The template lock guard has its own suite; these tests cover the service.
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    assertDeletable: vi.fn(),
    assertResourceEditable: vi.fn(),
  }),
  changedKeysOf: vi.fn(() => []),
}))

vi.mock("@chatbotx.io/database/client", async () => {
  const { installedResourceModelStub } = await import(
    "./helpers/template-guard-mocks"
  )
  const where = () => ({ returning: mocks.returning })
  const tx = {
    update: () => ({
      set: (values: unknown) => {
        mocks.set(values)
        return { where }
      },
    }),
    query: {
      customFieldModel: { findFirst: mocks.findFirst },
      // Every field counts as installed, so the lock path runs.
      templateInstalledResourceModel: installedResourceModelStub(),
    },
    execute: mocks.execute,
    // A fresh client per transaction, like the real driver: the lock registry is keyed by it.
    transaction: (callback: (client: unknown) => unknown) =>
      callback({ ...tx }),
  }
  return {
    db: tx,
    sql: vi.fn(),
    and: vi.fn(),
    eq: vi.fn(),
    inArray: vi.fn(),
    relationsFilterToSQL: vi.fn(),
    isDatabaseError: (error: unknown) => error instanceof FakeDatabaseError,
  }
})
vi.mock("@chatbotx.io/database/partials", () => ({ rootFolderId: "0" }))
vi.mock("@chatbotx.io/database/schema", () => ({ customFieldModel: {} }))
vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: vi.fn(),
  parseOrderByAsObject: vi.fn(),
  parsePagination: vi.fn(),
}))
vi.mock("@chatbotx.io/redis", () => ({
  withCache: async (_key: string, fn: () => Promise<unknown>) => await fn(),
  invalidateCacheByTags: vi.fn(),
}))
vi.mock("../src/folder/service", () => ({
  toStoredFolderId: (folderId: string | null | undefined) =>
    !folderId || folderId === "0" ? null : folderId,
  folderService: { ensureExists: vi.fn() },
}))

const { customFieldService } = await import("../src/custom-field/service")

const existing = { id: "cf-1", workspaceId: "ws-1", name: "a", folderId: null }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findFirst.mockResolvedValue(existing)
  vi.spyOn(customFieldService, "findByKeyOrFail").mockResolvedValue(
    existing as never,
  )
  vi.spyOn(customFieldService, "invalidate").mockResolvedValue(undefined)
})

describe("customFieldService.update", () => {
  test("a rename onto a name in use is a validation error on name", async () => {
    mocks.returning.mockRejectedValueOnce(
      new FakeDatabaseError({ code: "23505" }),
    )

    await expect(
      customFieldService.update(
        { workspaceId: "ws-1", id: "cf-1" },
        { name: "taken" },
      ),
    ).rejects.toMatchObject({ code: "validation", field: "name" })
  })

  test("other database errors are rethrown unchanged", async () => {
    const error = new FakeDatabaseError({ code: "40001" })
    mocks.returning.mockRejectedValueOnce(error)

    await expect(
      customFieldService.update(
        { workspaceId: "ws-1", id: "cf-1" },
        { name: "b" },
      ),
    ).rejects.toBe(error)
  })

  test("returns the updated row", async () => {
    mocks.returning.mockResolvedValueOnce([{ ...existing, name: "b" }])

    await expect(
      customFieldService.update(
        { workspaceId: "ws-1", id: "cf-1" },
        { name: "b" },
      ),
    ).resolves.toMatchObject({ name: "b" })
  })
})

describe("customFieldService.update folderId", () => {
  test("keeps the folder when folderId is omitted", async () => {
    mocks.returning.mockResolvedValueOnce([existing])

    await customFieldService.update(
      { workspaceId: "ws-1", id: "cf-1" },
      { name: "a" },
    )

    expect(mocks.set).toHaveBeenCalledWith({ name: "a" })
  })

  test('stores the root for "0"', async () => {
    mocks.returning.mockResolvedValueOnce([existing])

    await customFieldService.update(
      { workspaceId: "ws-1", id: "cf-1" },
      { name: "a", folderId: "0" },
    )

    expect(mocks.set).toHaveBeenCalledWith({ name: "a", folderId: null })
  })
})

describe("customFieldService.update name lock", () => {
  test("a rename takes the template lock, then the per-workspace name lock", async () => {
    mocks.execute.mockClear()
    mocks.returning.mockResolvedValueOnce([existing])

    await customFieldService.update(
      { workspaceId: "ws-1", id: "cf-1" },
      { name: "b" },
    )

    expect(mocks.execute).toHaveBeenCalledTimes(2)
  })

  test("the template lock is held before the stored row is read inside the transaction", async () => {
    mocks.execute.mockClear()
    mocks.findFirst.mockClear()
    mocks.returning.mockResolvedValueOnce([existing])

    await customFieldService.update(
      { workspaceId: "ws-1", id: "cf-1" },
      { description: "d" },
    )

    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findFirst.mock.invocationCallOrder[0] as number,
    )
  })

  test("a folder move never waits on the name lock", async () => {
    mocks.execute.mockClear()
    mocks.returning.mockResolvedValueOnce([existing])

    await customFieldService.update(
      { workspaceId: "ws-1", id: "cf-1" },
      { folderId: "0" },
    )

    // Only the template lock; the name lock is never taken.
    expect(mocks.execute).toHaveBeenCalledTimes(1)
  })
})
