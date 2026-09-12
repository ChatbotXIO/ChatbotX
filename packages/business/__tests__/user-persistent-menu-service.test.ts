// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockDeleteUserPersistentMenus } = vi.hoisted(() => ({
  mockDeleteUserPersistentMenus: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  createUserPersistentMenu: vi.fn(),
  deleteUserPersistentMenus: mockDeleteUserPersistentMenus,
  findUserPersistentMenuById: vi.fn(),
  listUserPersistentMenusByWorkspace: vi.fn(),
  updateUserPersistentMenu: vi.fn(),
}))

const { userPersistentMenuService } = await import(
  "../src/user-persistent-menu/service"
)

describe("userPersistentMenuService.delete", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // `get`/`update` on the same resource 404 via `findOrFail` for a
  // nonexistent or cross-workspace id — a single-id delete must match that,
  // not silently succeed for nothing.
  test("throws not-found when a single id was requested and nothing was deleted", async () => {
    mockDeleteUserPersistentMenus.mockResolvedValueOnce({ deletedIds: [] })

    await expect(
      userPersistentMenuService.delete({
        workspaceId: "ws-1",
        ids: ["missing-id"],
      }),
    ).rejects.toThrow("User persistent menu not found")
  })

  test("resolves when a single id was requested and it was deleted", async () => {
    mockDeleteUserPersistentMenus.mockResolvedValueOnce({
      deletedIds: ["menu-1"],
    })

    await expect(
      userPersistentMenuService.delete({
        workspaceId: "ws-1",
        ids: ["menu-1"],
      }),
    ).resolves.toBeUndefined()
  })

  // A bulk delete legitimately expects some requested ids to already be
  // gone (the private bulk-delete action) — that must stay a quiet no-op,
  // not a 404, so it can't regress into an error a bulk caller never
  // expected before this fix.
  test("does not throw for a bulk delete even if some ids were already gone", async () => {
    mockDeleteUserPersistentMenus.mockResolvedValueOnce({
      deletedIds: ["menu-1"],
    })

    await expect(
      userPersistentMenuService.delete({
        workspaceId: "ws-1",
        ids: ["menu-1", "already-gone"],
      }),
    ).resolves.toBeUndefined()
  })

  test("does not throw for an empty ids array", async () => {
    mockDeleteUserPersistentMenus.mockResolvedValueOnce({ deletedIds: [] })

    await expect(
      userPersistentMenuService.delete({ workspaceId: "ws-1", ids: [] }),
    ).resolves.toBeUndefined()
  })
})
