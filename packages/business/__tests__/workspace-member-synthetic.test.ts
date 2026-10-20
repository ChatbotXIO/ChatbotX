import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  buildSupportMembership,
  resolveWorkspaceMembership,
} from "../src/workspace-member/synthetic"

const mocks = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(),
  isSupportConsentRequired: vi.fn(),
}))

vi.mock("../src/user/utils", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}))
vi.mock("../src/workspace-support-access/consent", () => ({
  isSupportConsentRequired: mocks.isSupportConsentRequired,
}))

const user = { id: "user-1", email: "admin@chatbotx.io" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isSupportConsentRequired.mockResolvedValue(true)
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
  test("returns the real member when one exists, without checking super admin", async () => {
    const realMember = {
      userId: "user-1",
      role: "owner" as const,
      permissions: { superAdmin: true } as never,
    }

    const result = await resolveWorkspaceMembership({
      realMember,
      workspace: { id: "workspace-1", supportAccessUntil: null },
      user,
    })

    expect(result).toBe(realMember)
    expect(mocks.isSuperAdmin).not.toHaveBeenCalled()
  })

  test("returns undefined when no real member and caller is not super admin", async () => {
    mocks.isSuperAdmin.mockResolvedValue(false)

    const result = await resolveWorkspaceMembership({
      realMember: undefined,
      workspace: {
        id: "workspace-1",
        supportAccessUntil: new Date(Date.now() + 60_000),
      },
      user,
    })

    expect(result).toBeUndefined()
  })

  test("keeps consent required when enterprise policy requires it", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)

    const result = await resolveWorkspaceMembership({
      realMember: undefined,
      workspace: { id: "workspace-1", supportAccessUntil: null },
      user,
    })

    expect(result).toBeUndefined()
  })

  test("returns undefined when supportAccessUntil is in the past", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)

    const result = await resolveWorkspaceMembership({
      realMember: undefined,
      workspace: {
        id: "workspace-1",
        supportAccessUntil: new Date(Date.now() - 60_000),
      },
      user,
    })

    expect(result).toBeUndefined()
  })

  test("synthesizes a support membership when super admin and support access is enabled", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)

    const result = await resolveWorkspaceMembership({
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

  test("synthesizes a support membership without owner consent when enterprise policy disables consent", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.isSupportConsentRequired.mockResolvedValue(false)

    const result = await resolveWorkspaceMembership({
      realMember: undefined,
      workspace: { id: "workspace-1", supportAccessUntil: null },
      user,
    })

    expect(result?.workspaceId).toBe("workspace-1")
  })
})
