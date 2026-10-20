// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { platformAdminRepository } from "../src/repositories/platform-admin/repository"

const mocks = vi.hoisted(() => ({
  findRootUser: vi.fn(),
  insert: vi.fn(),
}))

vi.mock("../src/client", () => ({
  db: {
    insert: mocks.insert,
    query: { userModel: { findFirst: mocks.findRootUser } },
  },
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("../src/partials", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("../src/schema", () => ({
  platformAdminModel: { id: "id", userId: "userId" },
  userModel: { email: "email", id: "id", tenantId: "tenantId" },
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
  })

  test("creates the configured root administrator when no row exists", async () => {
    mocks.findRootUser.mockResolvedValue({ id: "root-user" })
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
  })

  test("does not report provisioning when the administrator already exists", async () => {
    mocks.findRootUser.mockResolvedValue({ id: "root-user" })
    mocks.insert.mockReturnValue(createInsertChain([]))

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).resolves.toBe(false)
  })

  test("does not insert when the configured email has no root-tenant user", async () => {
    mocks.findRootUser.mockResolvedValue(undefined)

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).resolves.toBe(false)

    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
