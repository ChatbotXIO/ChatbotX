import { describe, expect, test } from "vitest"
import {
  hasContactsAccess,
  hasWorkspacePermission,
} from "../src/workspace-member/permissions"

describe("hasWorkspacePermission (moved from apps/builder)", () => {
  test("superAdmin bypasses any specific flag", () => {
    expect(hasWorkspacePermission({ superAdmin: true }, "flows")).toBe(true)
  })

  test("requires the specific flag when not superAdmin", () => {
    expect(
      hasWorkspacePermission({ superAdmin: false, flows: true }, "flows"),
    ).toBe(true)
    expect(hasWorkspacePermission({ superAdmin: false }, "flows")).toBe(false)
  })

  test("fails closed on a missing key", () => {
    expect(hasWorkspacePermission({}, "flows")).toBe(false)
  })
})

describe("hasContactsAccess (moved from apps/builder)", () => {
  test("true for contacts", () => {
    expect(hasContactsAccess({ contacts: true })).toBe(true)
  })

  test("true for onlyAssignedContacts", () => {
    expect(hasContactsAccess({ onlyAssignedContacts: true })).toBe(true)
  })

  test("false with neither flag", () => {
    expect(hasContactsAccess({ analytics: true })).toBe(false)
  })
})
