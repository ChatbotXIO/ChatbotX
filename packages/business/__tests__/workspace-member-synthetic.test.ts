import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(),
}))

vi.mock("../src/user/utils", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}))

const { buildSupportMembership, resolveWorkspaceMembership } = await import(
  "../src/workspace-member/synthetic"
)

const user = { id: "user-1", email: "admin@chatbotx.io" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("buildSupportMembership", () => {
  test("builds a full-permission, agent-role member for the given ids", () => {
    const member = buildSupportMembership({
      workspaceId: "workspace-1",
      userId: "user-1",
    })

    expect(member.workspaceId).toBe("workspace-1")
    expect(member.userId).toBe("user-1")
    expect(member.role).toBe("agent")
    expect(member.permissions).toEqual({
      superAdmin: true,
      analytics: true,
      flows: true,
      contacts: true,
      onlyAssignedContacts: true,
      emailAndPhone: true,
      broadcast: true,
      ecommerce: true,
    })
  })

  test("id is deterministic for the same workspace/user pair", () => {
    const a = buildSupportMembership({
      workspaceId: "workspace-1",
      userId: "user-1",
    })
    const b = buildSupportMembership({
      workspaceId: "workspace-1",
      userId: "user-1",
    })
    expect(a.id).toBe(b.id)
  })
})

describe("resolveWorkspaceMembership", () => {
  test("returns the real member when one exists, without checking super admin", () => {
    const realMember = {
      userId: "user-1",
      role: "owner" as const,
      permissions: { superAdmin: true } as never,
    }

    const result = resolveWorkspaceMembership({
      realMember,
      workspace: { id: "workspace-1", supportAccessUntil: null },
      user,
    })

    expect(result).toBe(realMember)
    expect(mocks.isSuperAdmin).not.toHaveBeenCalled()
  })

  test("returns undefined when no real member and caller is not super admin", () => {
    mocks.isSuperAdmin.mockReturnValue(false)

    const result = resolveWorkspaceMembership({
      realMember: undefined,
      workspace: {
        id: "workspace-1",
        supportAccessUntil: new Date(Date.now() + 60_000),
      },
      user,
    })

    expect(result).toBeUndefined()
  })

  test("returns undefined when caller is super admin but support access is not enabled", () => {
    mocks.isSuperAdmin.mockReturnValue(true)

    const result = resolveWorkspaceMembership({
      realMember: undefined,
      workspace: { id: "workspace-1", supportAccessUntil: null },
      user,
    })

    expect(result).toBeUndefined()
  })

  test("returns undefined when supportAccessUntil is in the past", () => {
    mocks.isSuperAdmin.mockReturnValue(true)

    const result = resolveWorkspaceMembership({
      realMember: undefined,
      workspace: {
        id: "workspace-1",
        supportAccessUntil: new Date(Date.now() - 60_000),
      },
      user,
    })

    expect(result).toBeUndefined()
  })

  test("synthesizes a support membership when super admin and support access is enabled", () => {
    mocks.isSuperAdmin.mockReturnValue(true)

    const result = resolveWorkspaceMembership({
      realMember: undefined,
      workspace: {
        id: "workspace-1",
        supportAccessUntil: new Date(Date.now() + 60_000),
      },
      user,
    })

    expect(result).toBeDefined()
    expect(result?.workspaceId).toBe("workspace-1")
    expect(result?.userId).toBe("user-1")
    expect(result?.permissions.superAdmin).toBe(true)
  })
})
