import { describe, expect, test } from "vitest"
import {
  isSupportAccessEnabled,
  isWorkspaceAdminMember,
} from "../src/workspace-member/predicates"

describe("isSupportAccessEnabled", () => {
  test("returns false when supportAccessUntil is null", () => {
    expect(isSupportAccessEnabled({ supportAccessUntil: null })).toBe(false)
  })

  test("returns false when supportAccessUntil is in the past", () => {
    const past = new Date(Date.now() - 60_000)
    expect(isSupportAccessEnabled({ supportAccessUntil: past })).toBe(false)
  })

  test("returns true when supportAccessUntil is in the future", () => {
    const future = new Date(Date.now() + 60_000)
    expect(isSupportAccessEnabled({ supportAccessUntil: future })).toBe(true)
  })
})

describe("isWorkspaceAdminMember", () => {
  test("an owner is an admin regardless of permissions", () => {
    expect(
      isWorkspaceAdminMember({
        role: "owner",
        permissions: { superAdmin: false },
      }),
    ).toBe(true)
  })

  test("an agent with the superAdmin permission is an admin", () => {
    expect(
      isWorkspaceAdminMember({
        role: "agent",
        permissions: { superAdmin: true },
      }),
    ).toBe(true)
  })

  test("a plain agent is not an admin", () => {
    expect(
      isWorkspaceAdminMember({
        role: "agent",
        permissions: { superAdmin: false, broadcast: true },
      }),
    ).toBe(false)
  })

  test("malformed permissions never grant admin", () => {
    expect(isWorkspaceAdminMember({ role: "agent", permissions: null })).toBe(
      false,
    )
    expect(
      isWorkspaceAdminMember({
        role: "agent",
        permissions: { superAdmin: "yes" },
      }),
    ).toBe(false)
  })
})
