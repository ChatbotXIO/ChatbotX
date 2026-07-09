// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const applyContactFilterSpy = vi.fn<
  (criteria: unknown) => Record<string, unknown>
>(() => ({}))

vi.mock("@chatbotx.io/database/client", () => ({
  countWithRelationsFilter: vi.fn(),
  db: {
    query: {
      contactModel: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      inboxModel: { findMany: vi.fn() },
    },
    $count: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  applyContactFilter: (criteria: unknown) => applyContactFilterSpy(criteria),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: () => ({ limit: 20, offset: 0 }),
  parseOrderByAsObject: () => ({}),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

vi.mock("@/lib/log", () => ({
  logger: {
    error: vi.fn(),
  },
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
const { generateWhere } = await import(
  "../src/features/contacts/queries/list-contacts.queries"
)

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

  test("strips email and phone fields when PII is denied", () => {
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

describe("generateWhere contact permission scope", () => {
  beforeEach(() => {
    applyContactFilterSpy.mockReset()
    applyContactFilterSpy.mockReturnValue({})
  })

  test("removes email and phoneNumber keyword clauses when PII is denied", () => {
    const where = generateWhere(
      { workspaceId: "ws-1", keyword: "Example" },
      { canViewEmailAndPhone: false },
    )

    expect(where.OR).toEqual([
      { firstName: { ilike: "%example%" } },
      { lastName: { ilike: "%example%" } },
    ])
  })

  test("keeps email and phoneNumber keyword clauses when PII is allowed", () => {
    const where = generateWhere(
      { workspaceId: "ws-1", keyword: "Example" },
      { canViewEmailAndPhone: true },
    )

    expect(where.OR).toEqual([
      { firstName: { ilike: "%example%" } },
      { lastName: { ilike: "%example%" } },
      { email: { ilike: "%example%" } },
      { phoneNumber: { ilike: "%example%" } },
    ])
  })

  test("adds assigned-user relation scope", () => {
    const where = generateWhere(
      { workspaceId: "ws-1" },
      { canViewEmailAndPhone: true, restrictToAssignedUserId: "user-1" },
    )

    expect(where.conversation).toEqual({ assignedUserId: "user-1" })
  })

  test("merges assigned-user relation scope with existing conversation filters", () => {
    applyContactFilterSpy.mockReturnValue({
      conversation: { botEnabled: false },
    })

    const where = generateWhere(
      {
        workspaceId: "ws-1",
        contactFilter: { operator: "and", conditions: [] },
      },
      { canViewEmailAndPhone: true, restrictToAssignedUserId: "user-1" },
    )

    expect(where.conversation).toEqual({
      botEnabled: false,
      assignedUserId: "user-1",
    })
  })
})
