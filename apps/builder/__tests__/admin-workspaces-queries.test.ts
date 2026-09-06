// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const NOT_FOUND_SENTINEL = new Error("NOT_FOUND_SENTINEL")

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  listWorkspaces: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUser: mocks.getCurrentUser,
}))

vi.mock("@chatbotx.io/business", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
  workspaceSupportAccessService: { listWorkspaces: mocks.listWorkspaces },
}))

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND_SENTINEL
  },
}))

const { listAdminWorkspaces } = await import(
  "../src/features/admin-workspaces/queries"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("listAdminWorkspaces", () => {
  test("throws notFound and never queries when there is no current user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null)

    await expect(
      listAdminWorkspaces({ page: 1, perPage: 10, keyword: null }),
    ).rejects.toBe(NOT_FOUND_SENTINEL)
    expect(mocks.listWorkspaces).not.toHaveBeenCalled()
  })

  test("throws notFound and never queries when the current user is not a super admin", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" })
    mocks.isSuperAdmin.mockReturnValue(false)

    await expect(
      listAdminWorkspaces({ page: 1, perPage: 10, keyword: null }),
    ).rejects.toBe(NOT_FOUND_SENTINEL)
    expect(mocks.listWorkspaces).not.toHaveBeenCalled()
  })

  test("calls listWorkspaces with keyword undefined when keyword is null", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" })
    mocks.isSuperAdmin.mockReturnValue(true)
    mocks.listWorkspaces.mockResolvedValue({ data: [], pageCount: 0 })

    await listAdminWorkspaces({ page: 1, perPage: 10, keyword: null })

    expect(mocks.listWorkspaces).toHaveBeenCalledWith({
      page: 1,
      perPage: 10,
      keyword: undefined,
    })
  })

  test("passes the keyword through unchanged when set", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1" })
    mocks.isSuperAdmin.mockReturnValue(true)
    mocks.listWorkspaces.mockResolvedValue({ data: [], pageCount: 0 })

    await listAdminWorkspaces({ page: 2, perPage: 20, keyword: "acme" })

    expect(mocks.listWorkspaces).toHaveBeenCalledWith({
      page: 2,
      perPage: 20,
      keyword: "acme",
    })
  })
})
