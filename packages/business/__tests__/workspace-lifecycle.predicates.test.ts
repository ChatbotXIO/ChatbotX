import { describe, expect, test } from "vitest"
import {
  isWorkspaceScheduledForDeletion,
  resolveWorkspaceFreezeReason,
} from "../src/workspace-lifecycle/predicates"

describe("isWorkspaceScheduledForDeletion", () => {
  test.each([
    { scheduledDeletionAt: new Date("2026-01-01T00:00:00Z"), expected: true },
    { scheduledDeletionAt: null, expected: false },
    { scheduledDeletionAt: undefined, expected: false },
  ])("returns $expected for $scheduledDeletionAt", ({
    scheduledDeletionAt,
    expected,
  }) => {
    expect(isWorkspaceScheduledForDeletion({ scheduledDeletionAt })).toBe(
      expected,
    )
  })
})

describe("resolveWorkspaceFreezeReason", () => {
  const liveWorkspace = { scheduledDeletionAt: null }
  const allowed = { blocked: false }

  test("returns null when the workspace is live and the owner is not blocked", () => {
    expect(
      resolveWorkspaceFreezeReason({
        accessState: allowed,
        workspace: liveWorkspace,
      }),
    ).toBeNull()
  })

  test("returns missingWorkspace when the workspace row no longer exists", () => {
    expect(
      resolveWorkspaceFreezeReason({
        accessState: allowed,
        workspace: null,
      }),
    ).toBe("missingWorkspace")
  })

  test("returns scheduledForDeletion before ownerBlocked when both apply", () => {
    expect(
      resolveWorkspaceFreezeReason({
        accessState: { blocked: true },
        workspace: { scheduledDeletionAt: new Date("2026-01-01T00:00:00Z") },
      }),
    ).toBe("scheduledForDeletion")
  })

  test("returns ownerBlocked when only the owner entitlement is blocked", () => {
    expect(
      resolveWorkspaceFreezeReason({
        accessState: { blocked: true },
        workspace: liveWorkspace,
      }),
    ).toBe("ownerBlocked")
  })

  test("ignores the owner entitlement when no access state is supplied", () => {
    expect(
      resolveWorkspaceFreezeReason({ workspace: liveWorkspace }),
    ).toBeNull()
  })
})
