import { beforeEach, describe, expect, test, vi } from "vitest"
import { resolveWorkspaceAccess } from "../src/workspace-support-access/resolve-access"

const mocks = vi.hoisted(() => ({
  findForAuth: vi.fn(),
  isSuperAdmin: vi.fn(),
  isSupportConsentRequired: vi.fn(),
}))

vi.mock("../src/user/utils", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}))
vi.mock("../src/workspace-support-access/consent", () => ({
  isSupportConsentRequired: mocks.isSupportConsentRequired,
}))
vi.mock("../src/workspace/service", () => ({
  workspaceService: { findForAuth: mocks.findForAuth },
}))
vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { findMembership: vi.fn() },
}))

const user = { id: "user-1", email: "admin@chatbotx.io" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isSupportConsentRequired.mockResolvedValue(true)
})

describe("resolveWorkspaceAccess", () => {
  test("uses the real member's attached workspace without calling workspaceService.findForAuth", async () => {
    const realMember = {
      userId: "user-1",
      permissions: { superAdmin: false } as never,
      workspace: { id: "workspace-1", supportAccessUntil: null } as never,
    }

    const result = await resolveWorkspaceAccess({
      realMember,
      workspaceId: "workspace-1",
      user,
    })

    expect(result).toEqual({
      workspace: realMember.workspace,
      member: realMember,
      isSupportSession: false,
    })
    expect(mocks.findForAuth).not.toHaveBeenCalled()
  })

  test("fetches the workspace and synthesizes a support session when the caller is super admin and support access is enabled", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)
    const workspace = {
      id: "workspace-1",
      supportAccessUntil: new Date(Date.now() + 60_000),
    }
    mocks.findForAuth.mockResolvedValue(workspace)

    const result = await resolveWorkspaceAccess({
      realMember: undefined,
      workspaceId: "workspace-1",
      user,
    })

    expect(mocks.findForAuth).toHaveBeenCalledWith({ id: "workspace-1" })
    expect(result?.isSupportSession).toBe(true)
    expect(result?.workspace).toBe(workspace)
    expect(result?.member.userId).toBe("user-1")
  })

  test("keeps isSupportSession true when enterprise policy disables consent", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.isSupportConsentRequired.mockResolvedValue(false)
    mocks.findForAuth.mockResolvedValue({
      id: "workspace-1",
      supportAccessUntil: null,
    })

    const result = await resolveWorkspaceAccess({
      realMember: undefined,
      workspaceId: "workspace-1",
      user,
    })

    expect(result?.isSupportSession).toBe(true)
  })

  test("returns undefined when support access is not enabled and consent is required", async () => {
    mocks.isSuperAdmin.mockResolvedValue(true)
    mocks.findForAuth.mockResolvedValue({
      id: "workspace-1",
      supportAccessUntil: null,
    })

    const result = await resolveWorkspaceAccess({
      realMember: undefined,
      workspaceId: "workspace-1",
      user,
    })

    expect(result).toBeUndefined()
  })

  test("returns undefined when the workspace does not exist", async () => {
    mocks.findForAuth.mockResolvedValue(undefined)

    const result = await resolveWorkspaceAccess({
      realMember: undefined,
      workspaceId: "missing",
      user,
    })

    expect(result).toBeUndefined()
  })
})
