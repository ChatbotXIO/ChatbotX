import { canUseOwnCredentials } from "../src/platform-credential/can-use-own-credentials"
import { beforeEach, describe, expect, test, vi } from "vitest"

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
  test("allows an active tenant owner without reading their quota", async () => {
    tenantService.findByOwner.mockResolvedValue({ status: "active" })

    await expect(canUseOwnCredentials("owner-1")).resolves.toBe(true)
    expect(userQuotaService.getForUser).not.toHaveBeenCalled()
  })

  test("allows a user granted custom app credentials by their entitlement", async () => {
    tenantService.findByOwner.mockResolvedValue(undefined)
    userQuotaService.getForUser.mockResolvedValue({ customAppCredentials: true })

    await expect(canUseOwnCredentials("user-1")).resolves.toBe(true)
  })

  test("reads the default-plan overlay before denying a user without a tenant", async () => {
    tenantService.findByOwner.mockResolvedValue(undefined)
    userQuotaService.getForUser.mockResolvedValue({ customAppCredentials: true })

    await expect(canUseOwnCredentials("user-1")).resolves.toBe(true)
    expect(userQuotaService.getForUser).toHaveBeenCalledWith("user-1")
  })

  test("denies a user with neither an active tenant nor entitlement", async () => {
    tenantService.findByOwner.mockResolvedValue({ status: "suspended" })
    userQuotaService.getForUser.mockResolvedValue({ customAppCredentials: false })

    await expect(canUseOwnCredentials("user-1")).resolves.toBe(false)
  })
})
