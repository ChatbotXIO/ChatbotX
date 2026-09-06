import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(),
  findForAuth: vi.fn(),
  findMembership: vi.fn(),
}))

vi.mock("../src/user/utils", () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { findForAuth: mocks.findForAuth },
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: { findMembership: mocks.findMembership },
}))

const { hasWorkspaceAccess } = await import(
  "../src/workspace-support-access/resolve-access"
)

const user = { id: "user-1", email: "admin@chatbotx.io" }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("hasWorkspaceAccess", () => {
  test("returns true for a real member", async () => {
    mocks.findMembership.mockResolvedValue({
      userId: "user-1",
      permissions: { superAdmin: false },
      workspace: { id: "workspace-1", supportAccessUntil: null },
    })

    const result = await hasWorkspaceAccess({
      workspaceId: "workspace-1",
      user,
    })

    expect(result).toBe(true)
    expect(mocks.findForAuth).not.toHaveBeenCalled()
  })

  test("returns true for a super admin when support access is enabled", async () => {
    mocks.findMembership.mockResolvedValue(undefined)
    mocks.isSuperAdmin.mockReturnValue(true)
    mocks.findForAuth.mockResolvedValue({
      id: "workspace-1",
      supportAccessUntil: new Date(Date.now() + 60_000),
    })

    const result = await hasWorkspaceAccess({
      workspaceId: "workspace-1",
      user,
    })

    expect(result).toBe(true)
  })

  test("returns false when neither a real member nor an active support session exists", async () => {
    mocks.findMembership.mockResolvedValue(undefined)
    mocks.isSuperAdmin.mockReturnValue(false)
    mocks.findForAuth.mockResolvedValue({
      id: "workspace-1",
      supportAccessUntil: null,
    })

    const result = await hasWorkspaceAccess({
      workspaceId: "workspace-1",
      user,
    })

    expect(result).toBe(false)
  })
})
