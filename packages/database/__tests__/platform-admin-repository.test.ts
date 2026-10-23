// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { platformAdminRepository } from "../src/repositories/platform-admin/repository"

const mocks = vi.hoisted(() => {
  const cache = new Map<string, unknown>()
  return {
    cache,
    findFirst: vi.fn(),
    findIdByEmail: vi.fn(),
    insert: vi.fn(),
    invalidateCacheByTags: vi.fn(),
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
    insert: mocks.insert,
    query: {
      platformAdminModel: {
        findFirst: mocks.findFirst,
      },
    },
  },
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: mocks.invalidateCacheByTags,
  withCache: mocks.withCache,
}))
vi.mock("../src/partials", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("../src/repositories/user", () => ({
  userRepository: { findIdByEmail: mocks.findIdByEmail },
}))
vi.mock("../src/schema", () => ({
  platformAdminModel: { id: "id", userId: "userId" },
  userModel: {},
}))

const createInsertChain = (createdRows: { id: string }[]) => {
  const returning = vi.fn().mockResolvedValue(createdRows)
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoNothing })

  return { onConflictDoNothing, values }
}

describe("platformAdminRepository.bootstrapRootAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cache.clear()
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

    expect(chain.values).toHaveBeenCalledWith({ userId: "root-user" })
    expect(chain.onConflictDoNothing).toHaveBeenCalledWith({
      target: "userId",
    })
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "platform-admin:root-user",
    ])
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
})
