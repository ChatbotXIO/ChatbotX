// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockGetCurrentUserAndTargetWorkspace, mockNotFound } = vi.hoisted(
  () => ({
    mockGetCurrentUserAndTargetWorkspace: vi.fn(),
    mockNotFound: vi.fn(() => {
      throw new Error("not found")
    }),
  }),
)

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
}))

const { requireContactsAccess, resolveGuardedWorkspaceId } = await import(
  "../src/lib/auth/require-workspace-permission"
)

const basePermissions = {
  superAdmin: false,
  analytics: false,
  flows: false,
  contacts: false,
  onlyAssignedContacts: false,
  emailAndPhone: false,
  broadcast: false,
  ecommerce: false,
}

describe("requireContactsAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("allows members with assigned-only contact access", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          onlyAssignedContacts: true,
        },
      },
    })

    await expect(requireContactsAccess("ws-1")).resolves.toBeUndefined()

    expect(mockNotFound).not.toHaveBeenCalled()
  })

  test("rejects members without full or assigned-only contact access", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: basePermissions,
      },
    })

    await expect(requireContactsAccess("ws-1")).rejects.toThrow("not found")

    expect(mockNotFound).toHaveBeenCalled()
  })
})

describe("resolveGuardedWorkspaceId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns the workspace id when the requested permission is granted", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: {
          ...basePermissions,
          broadcast: true,
        },
      },
    })

    await expect(
      resolveGuardedWorkspaceId(
        Promise.resolve({ workspaceId: "ws-1" }),
        "broadcast",
      ),
    ).resolves.toBe("ws-1")
  })

  test("rejects when the requested permission is denied", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspaceMember: {
        permissions: basePermissions,
      },
    })

    await expect(
      resolveGuardedWorkspaceId(
        Promise.resolve({ workspaceId: "ws-1" }),
        "broadcast",
      ),
    ).rejects.toThrow("not found")
  })
})
