// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { platformAdminRepository } from "../src/repositories/platform-admin/repository"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
}))

vi.mock("../src/client", () => ({
  db: { transaction: mocks.transaction },
  desc: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}))
vi.mock("../src/partials", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("../src/schema", () => ({
  platformAdminBootstrapModel: { bootstrapKey: "bootstrapKey", id: "id" },
  platformAdminModel: { userId: "userId" },
  userModel: { email: "email", id: "id", tenantId: "tenantId" },
}))

const createTransactionClient = (markerRows: { id: string }[]) => {
  const returning = vi.fn().mockResolvedValue(markerRows)
  const onConflictDoNothing = vi.fn().mockReturnValue({ returning })
  const values = vi.fn().mockReturnValue({ onConflictDoNothing })
  const insert = vi.fn().mockReturnValue({ values })

  return {
    insert,
    query: {
      userModel: {
        findFirst: vi.fn().mockResolvedValue({ id: "root-user" }),
      },
    },
  }
}

describe("platformAdminRepository.bootstrapRootAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  test("does not recreate an administrator after the durable bootstrap marker exists", async () => {
    const tx = createTransactionClient([])
    mocks.transaction.mockImplementation(async (callback) => await callback(tx))
    const insertIgnore = vi.spyOn(platformAdminRepository, "insertIgnore")

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).resolves.toBe(false)

    expect(insertIgnore).not.toHaveBeenCalled()
  })

  test("fails the transaction when the administrator disappears during provisioning", async () => {
    const tx = createTransactionClient([{ id: "bootstrap-1" }])
    mocks.transaction.mockImplementation(async (callback) => await callback(tx))
    vi.spyOn(platformAdminRepository, "insertIgnore").mockResolvedValue(
      undefined,
    )

    await expect(
      platformAdminRepository.bootstrapRootAdmin({
        email: "admin@example.com",
      }),
    ).rejects.toThrow("Platform bootstrap administrator was deleted")
  })
})
