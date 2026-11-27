import { describe, expect, test, vi } from "vitest"

vi.mock("@/features/users/provider/user-hook", () => ({
  useWorkspaceMembers: vi.fn(),
}))

import { canSetFlag, type GrantLimits } from "../permissions-tab"
import { NO_PERMISSIONS } from "../settings-draft"

const settingsOnly: GrantLimits = {
  held: { ...NO_PERMISSIONS, canView: true, canManageSettings: true },
  policy: { limited: true, selfMemberId: "self" },
}

describe("canSetFlag", () => {
  test("an admin, token or support session may set anything", () => {
    const unlimited: GrantLimits = {
      held: NO_PERMISSIONS,
      policy: { limited: false },
    }
    expect(
      canSetFlag(unlimited, "self", NO_PERMISSIONS, "canDelete", true),
    ).toBe(true)
  })

  test("a limited member shares only what they hold", () => {
    expect(
      canSetFlag(settingsOnly, "other", NO_PERMISSIONS, "canView", true),
    ).toBe(true)
    expect(
      canSetFlag(settingsOnly, "other", NO_PERMISSIONS, "canEdit", true),
    ).toBe(false)
  })

  test("a row granting more than the caller holds can only be revoked whole", () => {
    // The server checks every flag the row keeps, not just the one toggled.
    const editor = { ...NO_PERMISSIONS, canView: true, canEdit: true }
    expect(
      canSetFlag(settingsOnly, "other", editor, "canManageSettings", true),
    ).toBe(false)
    expect(canSetFlag(settingsOnly, "other", editor, "canView", false)).toBe(
      false,
    )
    // Dropping the unheld flag itself leaves a row within the caller's grants.
    expect(canSetFlag(settingsOnly, "other", editor, "canEdit", false)).toBe(
      true,
    )
  })

  test("a limited member never edits their own row", () => {
    const own = { ...NO_PERMISSIONS, canView: true, canManageSettings: true }
    expect(canSetFlag(settingsOnly, "self", own, "canView", false)).toBe(false)
    expect(
      canSetFlag(settingsOnly, "self", own, "canManageSettings", true),
    ).toBe(false)
  })
})
