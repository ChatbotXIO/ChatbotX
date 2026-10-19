// @vitest-environment node
import type { UserModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { resolveCredentialScopedUserId } from "../src/features/platform-credentials/scope"

const { isSuperAdminSpy } = vi.hoisted(() => ({
  isSuperAdminSpy: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  isSuperAdmin: isSuperAdminSpy,
}))
vi.mock("@/env", () => ({ isCloud: () => true }))

const asUser = (id: string) => ({ id }) as UserModel

describe("resolveCredentialScopedUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("rejects a non-super-admin requesting platform scope", async () => {
    isSuperAdminSpy.mockResolvedValue(false)

    await expect(
      resolveCredentialScopedUserId(asUser("user-1"), "platform"),
    ).rejects.toThrow("Unauthorized")
  })

  test("resolves platform scope to undefined for a super admin", async () => {
    isSuperAdminSpy.mockResolvedValue(true)

    await expect(
      resolveCredentialScopedUserId(asUser("admin-1"), "platform"),
    ).resolves.toBeUndefined()
  })

  test("resolves user scope to the caller's own id without checking super-admin status", async () => {
    isSuperAdminSpy.mockResolvedValue(false)

    await expect(
      resolveCredentialScopedUserId(asUser("user-1"), "user"),
    ).resolves.toBe("user-1")
    expect(isSuperAdminSpy).not.toHaveBeenCalled()
  })
})
