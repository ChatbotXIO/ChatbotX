// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
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

  test("lands on the first granted section in nav priority order", () => {
    expect(
      resolveWorkspaceLandingSegment({
        superAdmin: false,
        analytics: false,
        flows: false,
        contacts: true,
      }),
    ).toBe("contacts")
  })

  test("falls back to the ungated inbox when no section is granted", () => {
    expect(resolveWorkspaceLandingSegment({})).toBe("inbox")
  })
})
