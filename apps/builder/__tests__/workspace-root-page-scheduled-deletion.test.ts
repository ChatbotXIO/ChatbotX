// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockEnforceFromRequest,
  mockGetCurrentUserAndTargetWorkspace,
  mockNotFound,
  mockRedirect,
} = vi.hoisted(() => ({
  mockEnforceFromRequest: vi.fn(),
  mockGetCurrentUserAndTargetWorkspace: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error("notFound")
  }),
  mockRedirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`)
  }),
}))

vi.mock("next/navigation", () => ({
  notFound: mockNotFound,
  redirect: mockRedirect,
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: mockGetCurrentUserAndTargetWorkspace,
}))

vi.mock("@/lib/workspace/require-not-scheduled-for-deletion", () => ({
  enforceWorkspaceNotScheduledForDeletionFromRequest: mockEnforceFromRequest,
}))

const WorkspacePage = (await import("@/app/space/[workspaceId]/page")).default

const memberWith = (permissions: Record<string, boolean>) => ({
  targetWorkspace: {
    id: "w1",
    scheduledDeletionAt: new Date("2026-01-02T00:00:00Z"),
  },
  targetWorkspaceMember: { permissions },
})

describe("workspace root page during the deletion grace window", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // clearAllMocks keeps implementations — reset the enforcer to a no-op so a
    // throwing implementation cannot leak into the next test.
    mockEnforceFromRequest.mockImplementation(() => Promise.resolve())
  })

  test("runs the scheduled-deletion enforcer before redirecting to a landing section", async () => {
    // Layout and page render in the SAME pass, so both redirects race. The page
    // must reach the identical verdict, otherwise the winner is a coin flip
    // between settings/general and the landing section.
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue(
      memberWith({ superAdmin: true }),
    )
    mockEnforceFromRequest.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/space/w1/settings/general")
    })

    await expect(
      WorkspacePage({ params: Promise.resolve({ workspaceId: "w1" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/space/w1/settings/general")

    expect(mockEnforceFromRequest).toHaveBeenCalledWith(
      { id: "w1", scheduledDeletionAt: new Date("2026-01-02T00:00:00Z") },
      true,
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("passes canManageDeletion=false for a member without superAdmin", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue(
      memberWith({ analytics: true }),
    )
    mockEnforceFromRequest.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT:/?workspaceDeletionPending=1")
    })

    await expect(
      WorkspacePage({ params: Promise.resolve({ workspaceId: "w1" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/?workspaceDeletionPending=1")

    expect(mockEnforceFromRequest).toHaveBeenCalledWith(
      expect.anything(),
      false,
    )
  })

  test("still redirects to the permitted landing section when no deletion is scheduled", async () => {
    mockGetCurrentUserAndTargetWorkspace.mockResolvedValue({
      targetWorkspace: { id: "w1", scheduledDeletionAt: null },
      targetWorkspaceMember: { permissions: { analytics: true } },
    })

    await expect(
      WorkspacePage({ params: Promise.resolve({ workspaceId: "w1" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/space/w1/dashboard")

    expect(mockEnforceFromRequest).toHaveBeenCalledTimes(1)
  })
})
