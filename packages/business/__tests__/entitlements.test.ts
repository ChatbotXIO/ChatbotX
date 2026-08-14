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

  test("disables enterprise features for cloud without a valid license", async () => {
    mocks.isCloud.mockReturnValue(true)
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(false)
    expect(mocks.getLicenseStatus).toHaveBeenCalled()
  })

  test("enables enterprise features for cloud with a valid license", async () => {
    mocks.isCloud.mockReturnValue(true)
    mocks.getLicenseStatus.mockResolvedValue({ state: "valid" })
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(true)
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

  test("treats an expired license as disabled", async () => {
    mocks.isEnterprise.mockReturnValue(true)
    mocks.getLicenseStatus.mockResolvedValue({ state: "expired" })
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(false)
  })
})

describe("assertEnterpriseFeatures", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isCloud.mockReturnValue(false)
    mocks.isEnterprise.mockReturnValue(false)
    mocks.getLicenseStatus.mockResolvedValue({ state: "missing" })
  })

  test("throws enterpriseFeatureRequired (403) on community", async () => {
    const { assertEnterpriseFeatures } = await import(
      "../src/user/entitlements"
    )

    await expect(assertEnterpriseFeatures()).rejects.toMatchObject({
      code: "enterpriseFeatureRequired",
      httpStatusCode: 403,
    })
  })

  test("throws when enterprise edition has no valid license", async () => {
    mocks.isEnterprise.mockReturnValue(true)
    const { assertEnterpriseFeatures } = await import(
      "../src/user/entitlements"
    )

    await expect(assertEnterpriseFeatures()).rejects.toMatchObject({
      code: "enterpriseFeatureRequired",
    })
  })

  test("resolves when the license is valid", async () => {
    mocks.isEnterprise.mockReturnValue(true)
    mocks.getLicenseStatus.mockResolvedValue({ state: "valid" })
    const { assertEnterpriseFeatures } = await import(
      "../src/user/entitlements"
    )

    await expect(assertEnterpriseFeatures()).resolves.toBeUndefined()
  })
})
