// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { platformAdminRepository } from "../src/repositories/platform-admin/repository"

const mocks = vi.hoisted(() => ({
  delete: vi.fn(),
  eq: vi.fn(),
  findFirst: vi.fn(),
  findIdByEmail: vi.fn(),
  insert: vi.fn(),
  ne: vi.fn((...args: unknown[]) => ({ ne: args })),
}))

vi.mock("../src/client", () => ({
  db: {
    delete: mocks.delete,
    insert: mocks.insert,
    query: {
      platformAdminModel: {
        findFirst: mocks.findFirst,
      },
    },
  },
  desc: vi.fn(),
  eq: mocks.eq,
  ne: mocks.ne,
}))
vi.mock("../src/partials", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("../src/repositories/user", () => ({
  userRepository: { findIdByEmail: mocks.findIdByEmail },
}))
vi.mock("../src/schema", () => ({
  platformAdminModel: { id: "id", role: "role", userId: "userId" },
  userModel: {},
}))

const createUpsertChain = (returnedRows: { id: string }[]) => {
  const returning = vi.fn().mockResolvedValue(returnedRows)
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate })

  return { onConflictDoUpdate, values }
}

describe("platformAdminRepository.bootstrapRootAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns true when it creates the configured root administrator", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "root-user" })
    const chain = createUpsertChain([{ id: "admin-1" }])
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
    expect(chain.onConflictDoUpdate).toHaveBeenCalledWith({
      set: { role: "super-admin" },
      setWhere: { ne: ["role", "super-admin"] },
      target: "userId",
    })
  })

  test("returns true when the conflict update promotes an administrator", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "root-user" })
    mocks.insert.mockReturnValue(createUpsertChain([{ id: "admin-1" }]))

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).resolves.toBe(true)
  })

  test("returns false when the administrator is already super-admin", async () => {
    mocks.findIdByEmail.mockResolvedValue({ id: "root-user" })
    mocks.insert.mockReturnValue(createUpsertChain([]))

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

describe("platformAdminRepository.findForAuth", () => {
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
