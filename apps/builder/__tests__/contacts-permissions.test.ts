// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business/contact-utils", () => ({
  maskContactEmailAndPhone: vi.fn((contact: unknown) => contact),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

const {
  canAccessContactsSection,
  canViewContactEmailAndPhone,
  getAssignedContactsUserId,
  requireContactPermissionScope,
  resolveContactPermissionScope,
  stripContactPIIFields,
} = await import("../src/features/contacts/permissions")
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

describe("contact permission helpers", () => {
  test("allows contacts section access with full or assigned-only contact permission", () => {
    expect(
      canAccessContactsSection({
        ...basePermissions,
        contacts: true,
        onlyAssignedContacts: false,
      }),
    ).toBe(true)
    expect(
      canAccessContactsSection({
        ...basePermissions,
        contacts: false,
        onlyAssignedContacts: true,
      }),
    ).toBe(true)
    expect(
      canAccessContactsSection({
        ...basePermissions,
        contacts: false,
        onlyAssignedContacts: false,
      }),
    ).toBe(false)
  })

  test("treats missing emailAndPhone as denied unless superAdmin is true", () => {
    expect(canViewContactEmailAndPhone({})).toBe(false)
    expect(canViewContactEmailAndPhone({ superAdmin: true })).toBe(true)
  })

  test("scopes assigned-only members to their own user id", () => {
    expect(
      getAssignedContactsUserId({
        permissions: { ...basePermissions, onlyAssignedContacts: true },
        userId: "user-1",
      }),
    ).toBe("user-1")
  })

  test("does not scope super admins even when onlyAssignedContacts is true", () => {
    expect(
      getAssignedContactsUserId({
        permissions: {
          ...basePermissions,
          onlyAssignedContacts: true,
          superAdmin: true,
        },
        userId: "user-1",
      }),
    ).toBeUndefined()
  })

  test("strips email and phone fields when emailAndPhone is denied", () => {
    expect(
      stripContactPIIFields(
        ["sys:firstName", "sys:email", "sys:phoneNumber", "tag:t1"],
        false,
      ),
    ).toEqual(["sys:firstName", "tag:t1"])
  })

  test("requires contacts access for mutation scopes", async () => {
    vi.mocked(getCurrentUserAndTargetWorkspace).mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          contacts: false,
          onlyAssignedContacts: false,
        },
      },
    } as never)

    await expect(requireContactPermissionScope("ws-1")).rejects.toThrow(
      "User is not authorized to access contacts",
    )
  })

  test("returns no contact permission scope without contact access", async () => {
    vi.mocked(getCurrentUserAndTargetWorkspace).mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          contacts: false,
          onlyAssignedContacts: false,
        },
      },
    } as never)

    await expect(resolveContactPermissionScope("ws-1")).resolves.toBeNull()
  })

  test("returns assigned-only mutation scope for assigned contacts members", async () => {
    vi.mocked(getCurrentUserAndTargetWorkspace).mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          contacts: false,
          onlyAssignedContacts: true,
          emailAndPhone: true,
        },
      },
    } as never)

    await expect(requireContactPermissionScope("ws-1")).resolves.toEqual({
      canViewEmailAndPhone: true,
      restrictToAssignedUserId: "user-1",
    })
  })
})
