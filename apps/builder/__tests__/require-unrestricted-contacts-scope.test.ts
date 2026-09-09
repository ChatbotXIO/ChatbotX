// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

const { requireUnrestrictedContactsScope } = await import(
  "@/features/contact-scan/lib/require-unrestricted-contacts-scope"
)
const { getCurrentUserAndTargetWorkspace } = await import("@/lib/auth/utils")

const basePermissions = {
  superAdmin: false,
  analytics: false,
  flows: false,
  contacts: true,
  onlyAssignedContacts: false,
  emailAndPhone: false,
  broadcast: false,
  ecommerce: false,
}

describe("requireUnrestrictedContactsScope", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUserAndTargetWorkspace).mockReset()
  })

  test("rethrows when the caller has no contacts access at all", async () => {
    vi.mocked(getCurrentUserAndTargetWorkspace).mockResolvedValue(null)

    await expect(
      requireUnrestrictedContactsScope("workspace-1"),
    ).rejects.toThrow("User is not associated with this workspace")
  })

  test("throws contactScanForbidden for an assigned-only member", async () => {
    vi.mocked(getCurrentUserAndTargetWorkspace).mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          contacts: false,
          onlyAssignedContacts: true,
        },
      },
    } as never)

    await expect(
      requireUnrestrictedContactsScope("workspace-1"),
    ).rejects.toMatchObject({
      code: "contactScanForbidden",
      httpStatusCode: 403,
    })
  })

  test("returns the unrestricted scope for a regular contacts member", async () => {
    vi.mocked(getCurrentUserAndTargetWorkspace).mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          contacts: true,
          onlyAssignedContacts: false,
        },
      },
    } as never)

    await expect(
      requireUnrestrictedContactsScope("workspace-1"),
    ).resolves.toEqual({
      canViewEmailAndPhone: false,
      restrictToAssignedUserId: undefined,
    })
  })

  test("returns the unrestricted scope for a super admin even with onlyAssignedContacts set", async () => {
    vi.mocked(getCurrentUserAndTargetWorkspace).mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          superAdmin: true,
          onlyAssignedContacts: true,
        },
      },
    } as never)

    await expect(
      requireUnrestrictedContactsScope("workspace-1"),
    ).resolves.toEqual({
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: undefined,
    })
  })
})
