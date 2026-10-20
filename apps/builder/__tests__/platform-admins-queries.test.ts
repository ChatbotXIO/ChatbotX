// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { listPlatformAdmins } from "../src/enterprise/features/platform-admins/queries"

const NOT_FOUND_SENTINEL = new Error("NOT_FOUND_SENTINEL")

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  list: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUser: mocks.getCurrentUser,
}))
vi.mock("@chatbotx.io/business", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
  platformAdminService: { list: mocks.list },
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND_SENTINEL
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listPlatformAdmins", () => {
  test("throws notFound without a current user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)

    await expect(listPlatformAdmins(1)).rejects.toBe(NOT_FOUND_SENTINEL)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  test("throws notFound for a non-admin user", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" })
    mocks.isSuperAdmin.mockResolvedValue(false)

    await expect(listPlatformAdmins(1)).rejects.toBe(NOT_FOUND_SENTINEL)
    expect(mocks.list).not.toHaveBeenCalled()
  })

  test("lists platform admins for a super admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" })
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.list.mockResolvedValue({ data: [], pageCount: 0 })

    await expect(listPlatformAdmins(2)).resolves.toEqual({
      data: [],
      pageCount: 0,
    })
    expect(mocks.list).toHaveBeenCalledWith({ page: 2, perPage: 50 })
  })
})
