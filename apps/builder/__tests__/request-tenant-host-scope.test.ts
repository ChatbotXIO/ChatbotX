// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: vi.fn(),
}))
vi.mock("@/lib/domain", () => ({ getDomainFromHeader: vi.fn() }))

const { ROOT_TENANT_ID } = await import("@chatbotx.io/database/schema")
const {
  canOpenWorkspaceOnHost,
  filterWorkspacesForHost,
  isWorkspaceVisibleOnHost,
} = await import("@/lib/tenant/request-tenant")

const TENANT = "tenant-a"
const OTHER_TENANT = "tenant-b"

describe("isWorkspaceVisibleOnHost", () => {
  test.each([
    [ROOT_TENANT_ID, ROOT_TENANT_ID, true],
    [TENANT, TENANT, true],
    [ROOT_TENANT_ID, TENANT, false],
    [TENANT, ROOT_TENANT_ID, false],
    [OTHER_TENANT, TENANT, false],
  ])("workspace %s on host %s → %s", (workspaceTenant, host, expected) => {
    expect(isWorkspaceVisibleOnHost(workspaceTenant, host)).toBe(expected)
  })
})

describe("canOpenWorkspaceOnHost", () => {
  test("tenant host + root workspace → denied", () => {
    expect(
      canOpenWorkspaceOnHost({
        workspaceTenantId: ROOT_TENANT_ID,
        hostTenantId: TENANT,
        isSupportSession: false,
      }),
    ).toBe(false)
  })

  test("root host + tenant workspace → denied", () => {
    expect(
      canOpenWorkspaceOnHost({
        workspaceTenantId: TENANT,
        hostTenantId: ROOT_TENANT_ID,
        isSupportSession: false,
      }),
    ).toBe(false)
  })

  test("root host + tenant workspace + support session → allowed", () => {
    expect(
      canOpenWorkspaceOnHost({
        workspaceTenantId: TENANT,
        hostTenantId: ROOT_TENANT_ID,
        isSupportSession: true,
      }),
    ).toBe(true)
  })

  test("tenant host + other tenant's workspace + support session → denied", () => {
    expect(
      canOpenWorkspaceOnHost({
        workspaceTenantId: OTHER_TENANT,
        hostTenantId: TENANT,
        isSupportSession: true,
      }),
    ).toBe(false)
  })
})

describe("filterWorkspacesForHost", () => {
  test("keeps only the host tenant's workspaces", () => {
    const items = [
      { id: "1", tenantId: ROOT_TENANT_ID },
      { id: "2", tenantId: TENANT },
      { id: "3", tenantId: OTHER_TENANT },
    ]
    expect(filterWorkspacesForHost(items, TENANT)).toEqual([items[1]])
    expect(filterWorkspacesForHost(items, ROOT_TENANT_ID)).toEqual([items[0]])
  })
})
