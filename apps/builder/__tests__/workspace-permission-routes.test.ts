// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  hasContactsAccess,
  hasWorkspacePermission,
  PERMISSION_NAV,
  resolveWorkspaceLandingSegment,
} from "../src/lib/auth/permission-routes"

describe("workspace permission routes", () => {
  test("maps guarded workspace routes to their permission flags", () => {
    expect(PERMISSION_NAV).toEqual({
      dashboard: "analytics",
      flows: "flows",
      contacts: "contacts",
      broadcasts: "broadcast",
      sequences: "broadcast",
      products: "ecommerce",
    })
  })

  test("allows super admins to access every mapped permission", () => {
    expect(hasWorkspacePermission({ superAdmin: true }, "flows")).toBe(true)
    expect(hasWorkspacePermission({ superAdmin: true }, "ecommerce")).toBe(true)
  })

  test("requires the requested flag when the member is not a super admin", () => {
    expect(
      hasWorkspacePermission({ superAdmin: false, flows: true }, "flows"),
    ).toBe(true)
    expect(
      hasWorkspacePermission({ superAdmin: false, flows: true }, "contacts"),
    ).toBe(false)
  })

  test("denies missing jsonb permission keys by default", () => {
    expect(hasWorkspacePermission({}, "broadcast")).toBe(false)
  })
})

describe("hasContactsAccess", () => {
  test("grants access with the full contacts flag", () => {
    expect(hasContactsAccess({ contacts: true })).toBe(true)
  })

  test("grants access with only the assigned-contacts flag", () => {
    expect(hasContactsAccess({ onlyAssignedContacts: true })).toBe(true)
  })

  test("grants access to super admins", () => {
    expect(hasContactsAccess({ superAdmin: true })).toBe(true)
  })

  test("denies access without any contacts flag", () => {
    expect(hasContactsAccess({})).toBe(false)
  })
})

describe("resolveWorkspaceLandingSegment", () => {
  test("lands super admins on the dashboard", () => {
    expect(resolveWorkspaceLandingSegment({ superAdmin: true })).toBe(
      "dashboard",
    )
  })

  test("lands on the dashboard when analytics is granted", () => {
    expect(
      resolveWorkspaceLandingSegment({ superAdmin: false, analytics: true }),
    ).toBe("dashboard")
  })

  test("skips the dashboard and lands on flows without analytics", () => {
    expect(
      resolveWorkspaceLandingSegment({
        superAdmin: false,
        analytics: false,
        flows: true,
      }),
    ).toBe("flows")
  })

  test("lands contacts members on the inbox in nav priority order", () => {
    expect(
      resolveWorkspaceLandingSegment({
        superAdmin: false,
        analytics: false,
        flows: false,
        contacts: true,
      }),
    ).toBe("inbox")
  })

  test("lands assigned-only members on the inbox", () => {
    expect(resolveWorkspaceLandingSegment({ onlyAssignedContacts: true })).toBe(
      "inbox",
    )
  })

  test("prefers the inbox over flows for contacts members", () => {
    expect(
      resolveWorkspaceLandingSegment({ flows: true, contacts: true }),
    ).toBe("inbox")
  })

  test("lands ecommerce-only members on products", () => {
    expect(resolveWorkspaceLandingSegment({ ecommerce: true })).toBe("products")
  })

  test("returns null when no section is granted", () => {
    expect(resolveWorkspaceLandingSegment({})).toBeNull()
    expect(resolveWorkspaceLandingSegment({ emailAndPhone: true })).toBeNull()
  })
})
