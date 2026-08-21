import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isCloud: vi.fn(),
  isEnterprise: vi.fn(),
}))

vi.mock("../src/keys", () => ({
  isCloud: mocks.isCloud,
  isEnterprise: mocks.isEnterprise,
}))

describe("enterprise entitlements", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isCloud.mockReturnValue(false)
    mocks.isEnterprise.mockReturnValue(false)
  })

  test("enables enterprise features for cloud", async () => {
    mocks.isCloud.mockReturnValue(true)
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(true)
  })

  test("disables enterprise features for community", async () => {
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(false)
  })

  test("enables enterprise features for self-hosted enterprise without a license", async () => {
    mocks.isEnterprise.mockReturnValue(true)
    const { hasEnterpriseFeatures } = await import("../src/user/entitlements")

    await expect(hasEnterpriseFeatures()).resolves.toBe(true)
  })
})
