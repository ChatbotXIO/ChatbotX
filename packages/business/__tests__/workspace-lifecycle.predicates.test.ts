import { describe, expect, test } from "vitest"
import { isWorkspaceScheduledForDeletion } from "../src/workspace-lifecycle/predicates"

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
