// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { userRepository } from "../src/repositories/user/repository"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insert: vi.fn(),
  isUniqueViolationError: vi.fn(),
}))

vi.mock("../src/client", () => ({
  db: {
    query: { userModel: { findFirst: mocks.findFirst } },
    transaction: (callback: (tx: { insert: typeof mocks.insert }) => unknown) =>
      callback({ insert: mocks.insert }),
  },
  isUniqueViolationError: mocks.isUniqueViolationError,
}))
vi.mock("../src/schema", () => ({
  accountModel: { id: "Account.id" },
  userModel: { id: "User.id" },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isUniqueViolationError.mockReturnValue(false)
})

describe("userRepository", () => {
  test("finds an id within the supplied tenant", async () => {
    mocks.findFirst.mockResolvedValue({ id: "user-1" })

    await expect(
      userRepository.findIdByEmail({
        email: "admin@example.com",
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual({ id: "user-1" })

    expect(mocks.findFirst).toHaveBeenCalledWith({
      columns: { id: true },
      where: { email: "admin@example.com", tenantId: "tenant-1" },
    })
  })

  test("creates a verified credential account with a forced password change", async () => {
    const accountValues = vi.fn().mockResolvedValue(undefined)
    const returning = vi.fn().mockResolvedValue([{ id: "user-2" }])
    const userValues = vi.fn().mockReturnValue({ returning })
    mocks.insert
      .mockReturnValueOnce({ values: userValues })
      .mockReturnValueOnce({ values: accountValues })

    await expect(
      userRepository.insertWithCredential({
        email: "new@example.com",
        hashedPassword: "hashed-password",
        name: "New User",
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual({ created: true, userId: "user-2" })

    expect(userValues).toHaveBeenCalledWith({
      email: "new@example.com",
      emailVerified: true,
      mustChangePassword: true,
      name: "New User",
      tenantId: "tenant-1",
    })
    expect(accountValues).toHaveBeenCalledWith({
      accountId: "user-2",
      password: "hashed-password",
      providerId: "credential",
      tenantId: "tenant-1",
      userId: "user-2",
    })
  })

  test("returns the concurrent winner when the tenant-scoped email is taken", async () => {
    const returning = vi.fn().mockRejectedValue({ code: "23505" })
    mocks.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({ returning }),
    })
    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.findFirst.mockResolvedValue({ id: "raced-user" })

    await expect(
      userRepository.insertWithCredential({
        email: "raced@example.com",
        hashedPassword: "hashed-password",
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual({ created: false, userId: "raced-user" })

    expect(mocks.findFirst).toHaveBeenCalledWith({
      columns: { id: true },
      where: { email: "raced@example.com", tenantId: "tenant-1" },
    })
  })
})
