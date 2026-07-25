// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockRedirect } = vi.hoisted(() => ({
  mockRedirect: vi.fn((path: string) => {
    // Mirrors Next.js: redirect() throws so nothing after it runs.
    const error = new Error(`NEXT_REDIRECT:${path}`)
    throw error
  }),
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("@chatbotx.io/business", () => ({
  isWorkspaceScheduledForDeletion: (workspace: {
    scheduledDeletionAt: Date | string | null
  }) => workspace.scheduledDeletionAt != null,
}))

const { enforceWorkspaceNotScheduledForDeletion } = await import(
  "@/lib/workspace/require-not-scheduled-for-deletion"
)

const SETTINGS_GENERAL = "/space/w1/settings/general"

const scheduledWorkspace = {
  id: "w1",
  scheduledDeletionAt: new Date("2026-01-02T00:00:00Z"),
}

const activeWorkspace = { id: "w1", scheduledDeletionAt: null }

describe("enforceWorkspaceNotScheduledForDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("does nothing for a workspace that is not scheduled for deletion", () => {
    expect(() =>
      enforceWorkspaceNotScheduledForDeletion(
        activeWorkspace,
        "/space/w1/broadcasts",
        true,
      ),
    ).not.toThrow()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("redirects a super admin from another section to settings/general", () => {
    expect(() =>
      enforceWorkspaceNotScheduledForDeletion(
        scheduledWorkspace,
        "/space/w1/broadcasts",
        true,
      ),
    ).toThrow("NEXT_REDIRECT")

    expect(mockRedirect).toHaveBeenCalledWith(SETTINGS_GENERAL)
  })

  test("does not redirect when already on settings/general", () => {
    expect(() =>
      enforceWorkspaceNotScheduledForDeletion(
        scheduledWorkspace,
        SETTINGS_GENERAL,
        true,
      ),
    ).not.toThrow()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("does not redirect when already on settings/general with a trailing slash", () => {
    expect(() =>
      enforceWorkspaceNotScheduledForDeletion(
        scheduledWorkspace,
        `${SETTINGS_GENERAL}/`,
        true,
      ),
    ).not.toThrow()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("does not redirect when the current pathname is unknown, so an unresolvable request cannot bounce a user in a loop", () => {
    // `x-url` missing or unparseable leaves the pathname empty. Redirecting on
    // an unknown location can target the page the user is already on, and the
    // client router turns that into an endless refetch/redirect loop. The
    // banner plus the action-layer guards still hold the freeze.
    expect(() =>
      enforceWorkspaceNotScheduledForDeletion(scheduledWorkspace, "", true),
    ).not.toThrow()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("redirects a member without deletion-management permission to the workspace list", () => {
    expect(() =>
      enforceWorkspaceNotScheduledForDeletion(
        scheduledWorkspace,
        "/space/w1/broadcasts",
        false,
      ),
    ).toThrow("NEXT_REDIRECT")

    expect(mockRedirect).toHaveBeenCalledWith("/?workspaceDeletionPending=1")
  })
})
