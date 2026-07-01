import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getLicenseStatus: vi.fn(),
  isCloud: vi.fn(),
  isEnterprise: vi.fn(),
}))

vi.mock("../src/keys", () => ({
  isCloud: mocks.isCloud,
  isEnterprise: mocks.isEnterprise,
}))

vi.mock("../src/enterprise/license/service", () => ({
  getLicenseStatus: mocks.getLicenseStatus,
}))

describe("enterprise entitlements", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isCloud.mockReturnValue(false)
    mocks.isEnterprise.mockReturnValue(false)
    mocks.getLicenseStatus.mockResolvedValue({ state: "missing" })
  })

  test("enables enterprise features for cloud without a license check", async () => {
    mocks.isCloud.mockReturnValue(true)
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(true)
    expect(mocks.getLicenseStatus).not.toHaveBeenCalled()
  })

  test("disables enterprise features for community", async () => {
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(false)
    expect(mocks.getLicenseStatus).not.toHaveBeenCalled()
  })

  test("enables enterprise features only when the license is valid", async () => {
    mocks.isEnterprise.mockReturnValue(true)
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(false)

    mocks.getLicenseStatus.mockResolvedValue({ state: "valid" })
    await expect(hasEnterpriseFeatures()).resolves.toBe(true)
  })
})
