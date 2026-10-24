// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { platformAdminRepository } from "../src/repositories/platform-admin/repository"

const mocks = vi.hoisted(() => {
  const cache = new Map<string, unknown>()
  return {
    cache,
    delete: vi.fn(),
    eq: vi.fn(),
    findFirst: vi.fn(),
    findIdByEmail: vi.fn(),
    insert: vi.fn(),
    invalidateCacheKeys: vi.fn(),
    update: vi.fn(),
    withCache: vi.fn(
      async (key: string, loader: () => Promise<unknown>): Promise<unknown> => {
        const cached = cache.get(key)
        if (cached !== undefined) {
          return cached
        }

        const value = await loader()
        if (value !== null && value !== undefined) {
          cache.set(key, value)
        }
        return value
      },
    ),
  }
})

vi.mock("../src/client", () => ({
  db: {
    delete: mocks.delete,
    insert: mocks.insert,
    update: mocks.update,
    query: {
      platformAdminModel: {
        findFirst: mocks.findFirst,
      },
    },
  },
  and: vi.fn(),
  desc: vi.fn(),
  eq: mocks.eq,
  ne: vi.fn(),
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheKeys: mocks.invalidateCacheKeys,
  withCache: mocks.withCache,
}))
vi.mock("../src/partials", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("../src/repositories/user", () => ({
  userRepository: { findIdByEmail: mocks.findIdByEmail },
}))
vi.mock("../src/schema", () => ({
  platformAdminModel: { id: "id", role: "role", userId: "userId" },
  userModel: {},
}))

const createInsertChain = (createdRows: { id: string }[]) => {
  const returning = vi.fn().mockResolvedValue(createdRows)
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoNothing })

  return { onConflictDoNothing, values }
}

const createUpsertChain = (createdRows: { id: string }[]) => {
  const returning = vi.fn().mockResolvedValue(createdRows)
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })

  return { onConflictDoUpdate, values }
}

const createUpdateChain = (updatedRows: { id: string }[]) => {
  const returning = vi.fn().mockResolvedValue(updatedRows)
  const where = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where })

  return { set, where }
}

describe("platformAdminRepository.bootstrapRootAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cache.clear()
    mocks.update.mockReturnValue(createUpdateChain([]))
  })

  test("creates the configured root administrator when no row exists", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "root-user" })
    const chain = createInsertChain([{ id: "admin-1" }])
    mocks.insert.mockReturnValue(chain)

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).resolves.toBe(true)

    expect(chain.values).toHaveBeenCalledWith({
      role: "super-admin",
      userId: "root-user",
    })
    expect(chain.onConflictDoNothing).toHaveBeenCalledWith({
      target: "userId",
    })
    expect(mocks.invalidateCacheKeys).toHaveBeenCalledWith(
      "platform-admin:root-user",
    )
  })

  test("does not report provisioning when the administrator already exists", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "root-user" })
    mocks.insert.mockReturnValue(createInsertChain([]))

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).resolves.toBe(false)
  })

  test("promotes an existing administrator to super-admin", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "root-user" })
    mocks.insert.mockReturnValue(createInsertChain([]))
    const chain = createUpdateChain([{ id: "admin-1" }])
    mocks.update.mockReturnValue(chain)

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).resolves.toBe(true)

    expect(chain.set).toHaveBeenCalledWith({ role: "super-admin" })
    expect(mocks.invalidateCacheKeys).toHaveBeenCalledWith(
      "platform-admin:root-user",
    )
  })

  test("does not insert when the configured email has no root-tenant user", async () => {
    mocks.findIdByEmail.mockResolvedValue(undefined)

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).resolves.toBe(false)

    expect(mocks.insert).not.toHaveBeenCalled()
  })
})

describe("platformAdminRepository.upsertRole", () => {
  test("inserts or updates the requested role", async () => {
    const chain = createUpsertChain([{ id: "admin-1" }])
    mocks.insert.mockReturnValue(chain)

    await platformAdminRepository.upsertRole({
      role: "support",
      userId: "user-1",
    })

    expect(chain.values).toHaveBeenCalledWith({
      role: "support",
      userId: "user-1",
    })
    expect(chain.onConflictDoUpdate).toHaveBeenCalledWith({
      set: { role: "support" },
      target: "userId",
    })
  })
})

describe("platformAdminRepository.deleteByUserId", () => {
  test("deletes the administrator row", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    mocks.delete.mockReturnValue({ where })

    await platformAdminRepository.deleteByUserId("user-1")

    expect(mocks.delete).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "userId" }),
    )
    expect(mocks.eq).toHaveBeenCalledWith("userId", "user-1")
  })
})

describe("platformAdminRepository.findByUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cache.clear()
  })

  test("reuses a cached administrator instead of querying the database", async () => {
    const admin = { id: "admin-1", userId: "user-1" }
    mocks.findFirst.mockResolvedValue(admin)

    await expect(platformAdminRepository.findByUserId("user-1")).resolves.toBe(
      admin,
    )
    await expect(platformAdminRepository.findByUserId("user-1")).resolves.toBe(
      admin,
    )

    expect(mocks.findFirst).toHaveBeenCalledTimes(1)
  })

  test("reads administrator roles fresh for authorization", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "admin-1",
      role: "super-admin",
      userId: "user-1",
    })

    await platformAdminRepository.findForAuth("user-1")
    await platformAdminRepository.findForAuth("user-1")

    expect(mocks.findFirst).toHaveBeenCalledTimes(2)
  })
})
