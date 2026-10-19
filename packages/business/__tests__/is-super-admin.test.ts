import { beforeEach, describe, expect, test, vi } from "vitest"
import { isSuperAdmin } from "../src/user/utils"

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  keys: vi.fn(),
}))

vi.mock("../src/keys", () => ({
  isCloud: () => false,
  keys: mocks.keys,
}))
vi.mock("../src/platform-admin/service", () => ({
  platformAdminService: {
    isAdmin: mocks.isAdmin,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isAdmin.mockResolvedValue(false)
  mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: "admin@example.com" })
})

describe("isSuperAdmin", () => {
  test("accepts a persisted platform admin in the community edition", async () => {
    mocks.isAdmin.mockResolvedValue(true)

    await expect(
      isSuperAdmin({ id: "user-1", email: "admin@example.com" }),
    ).resolves.toBe(true)
    expect(mocks.isAdmin).toHaveBeenCalledWith("user-1")
  })

  test("rejects a configured bootstrap email without a persisted admin row", async () => {
    await expect(
      isSuperAdmin({ id: "user-1", email: "admin@example.com" }),
    ).resolves.toBe(false)
    expect(mocks.isAdmin).toHaveBeenCalledWith("user-1")
  })

  test("does not inspect bootstrap configuration during authorization", async () => {
    await isSuperAdmin({ id: "user-1", email: "user@example.com" })

    expect(mocks.keys).not.toHaveBeenCalled()
  })
})
