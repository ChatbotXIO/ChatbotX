import { beforeEach, describe, expect, test, vi } from "vitest"

const { findEmailCached, resolveTenantOwnerId } = vi.hoisted(() => ({
  findEmailCached: vi.fn(),
  resolveTenantOwnerId: vi.fn(),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  tenantOwnerEmailReservedException: () =>
    Object.assign(new Error("reserved"), { code: "tenantOwnerEmailReserved" }),
}))
vi.mock("@chatbotx.io/business", () => ({
  userService: { findEmailCached },
}))
vi.mock("@chatbotx.io/database/schema", () => ({ ROOT_TENANT_ID: "1" }))
vi.mock("../src/tenant-context", () => ({ resolveTenantOwnerId }))

import { assertNotTenantOwnerEmail } from "../src/tenant-owner-email"

beforeEach(() => {
  vi.clearAllMocks()
  resolveTenantOwnerId.mockResolvedValue("owner-1")
  findEmailCached.mockResolvedValue("Owner@Example.com")
})

describe("assertNotTenantOwnerEmail", () => {
  test("rejects the owner's email regardless of case", async () => {
    await expect(
      assertNotTenantOwnerEmail({ email: "owner@example.com", tenantId: "42" }),
    ).rejects.toMatchObject({ code: "tenantOwnerEmailReserved" })
  })

  test("allows any other email in the tenant", async () => {
    await expect(
      assertNotTenantOwnerEmail({ email: "other@example.com", tenantId: "42" }),
    ).resolves.toBeUndefined()
  })

  test("never restricts the root tenant", async () => {
    await expect(
      assertNotTenantOwnerEmail({ email: "owner@example.com", tenantId: "1" }),
    ).resolves.toBeUndefined()
    expect(resolveTenantOwnerId).not.toHaveBeenCalled()
  })

  test("allows when the tenant has no owner", async () => {
    resolveTenantOwnerId.mockResolvedValue(null)
    await expect(
      assertNotTenantOwnerEmail({ email: "owner@example.com", tenantId: "42" }),
    ).resolves.toBeUndefined()
  })
})
