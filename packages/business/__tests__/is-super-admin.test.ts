import { beforeEach, describe, expect, test, vi } from "vitest"
import { isSuperAdmin } from "../src/user/utils"

const mocks = vi.hoisted(() => ({
  findForAuth: vi.fn(),
  keys: vi.fn(),
}))

vi.mock("../src/keys", () => ({
  isCloud: () => false,
  keys: mocks.keys,
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  platformAdminRepository: {
    findForAuth: mocks.findForAuth,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findForAuth.mockResolvedValue(undefined)
  mocks.keys.mockReturnValue({ PLATFORM_ADMIN_EMAIL: "admin@example.com" })
})

describe("isSuperAdmin", () => {
  test.each([
    "super-admin",
    "support",
  ])("accepts the persisted %s administrator role in the community edition", async (role) => {
    mocks.findForAuth.mockResolvedValue({ role })

    await expect(
      isSuperAdmin({ id: "user-1", email: "admin@example.com" }),
    ).resolves.toBe(true)
  })

  test("rejects users without a persisted administrator role", async () => {
    await expect(
      isSuperAdmin({ id: "user-1", email: "admin@example.com" }),
    ).resolves.toBe(false)
  })

  test("does not inspect bootstrap configuration during authorization", async () => {
    await isSuperAdmin({ id: "user-1", email: "user@example.com" })

    expect(mocks.keys).not.toHaveBeenCalled()
  })
})
