// @vitest-environment node
import type { UserModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { resolveCredentialScopedUserId } from "../src/features/platform-credentials/scope"

const { canUseOwnCredentialsSpy, isSuperAdminSpy } = vi.hoisted(() => ({
  canUseOwnCredentialsSpy: vi.fn(),
  isSuperAdminSpy: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  canUseOwnCredentials: canUseOwnCredentialsSpy,
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

  test("rejects user scope for a cloud user without credential entitlement", async () => {
    isSuperAdminSpy.mockResolvedValue(false)
    canUseOwnCredentialsSpy.mockResolvedValue(false)
    await expect(
      resolveCredentialScopedUserId(asUser("user-1"), "user"),
    ).rejects.toThrow("Unauthorized")
    expect(isSuperAdminSpy).not.toHaveBeenCalled()
  })

  test("resolves user scope for a cloud user with credential entitlement", async () => {
    canUseOwnCredentialsSpy.mockResolvedValue(true)

    await expect(
      resolveCredentialScopedUserId(asUser("user-1"), "user"),
    ).resolves.toBe("user-1")
  })
})
