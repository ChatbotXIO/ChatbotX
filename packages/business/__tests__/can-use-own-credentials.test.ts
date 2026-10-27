import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  canUseOwnCredentials,
  hasOwnCredentialAccess,
} from "../src/platform-credential/can-use-own-credentials"

const { tenantService, userQuotaService } = vi.hoisted(() => ({
  tenantService: { findByOwner: vi.fn() },
  userQuotaService: { getForUser: vi.fn() },
}))

vi.mock("../src/enterprise/tenant/service", () => ({ tenantService }))
vi.mock("../src/user-quota/service", () => ({ userQuotaService }))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("canUseOwnCredentials", () => {
  test("allows an active tenant owner even when their entitlement is disabled", async () => {
    tenantService.findByOwner.mockResolvedValue({ status: "active" })
    userQuotaService.getForUser.mockResolvedValue({
      customAppCredentials: false,
    })

    await expect(canUseOwnCredentials("owner-1")).resolves.toBe(true)
    expect(userQuotaService.getForUser).not.toHaveBeenCalled()
  })

  test("allows a user granted custom app credentials by their entitlement", async () => {
    tenantService.findByOwner.mockResolvedValue(undefined)
    userQuotaService.getForUser.mockResolvedValue({
      customAppCredentials: true,
    })

    await expect(canUseOwnCredentials("user-1")).resolves.toBe(true)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith("user-1")
  })

  test("denies a user with neither an active tenant nor entitlement", async () => {
    tenantService.findByOwner.mockResolvedValue({ status: "suspended" })
    userQuotaService.getForUser.mockResolvedValue({
      customAppCredentials: false,
    })

    await expect(canUseOwnCredentials("user-1")).resolves.toBe(false)
  })
})

describe("hasOwnCredentialAccess", () => {
  test.each([
    {
      expected: true,
      name: "allows an active tenant",
      quota: undefined,
      tenant: { status: "active" },
    },
    {
      expected: true,
      name: "allows a quota flag",
      quota: { customAppCredentials: true },
      tenant: undefined,
    },
    {
      expected: false,
      name: "denies a suspended tenant without a quota flag",
      quota: { customAppCredentials: false },
      tenant: { status: "suspended" },
    },
    {
      expected: false,
      name: "denies missing tenant and quota records",
      quota: undefined,
      tenant: null,
    },
  ])("$name", ({ expected, quota, tenant }) => {
    expect(hasOwnCredentialAccess(tenant, quota)).toBe(expected)
  })
})
