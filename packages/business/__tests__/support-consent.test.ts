import { beforeEach, describe, expect, test, vi } from "vitest"
import { isSupportConsentRequired } from "../src/workspace-support-access/consent"

const mocks = vi.hoisted(() => ({
  hasEnterpriseFeatures: vi.fn(),
  keys: vi.fn(),
}))

vi.mock("../src/keys", () => ({ keys: mocks.keys }))
vi.mock("../src/user/entitlements", () => ({
  hasEnterpriseFeatures: mocks.hasEnterpriseFeatures,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.keys.mockReturnValue({ SUPPORT_ACCESS_REQUIRE_CONSENT: true })
  mocks.hasEnterpriseFeatures.mockResolvedValue(false)
})

describe("isSupportConsentRequired", () => {
  test.each([
    { enterprise: false, requireConsent: false, expected: true },
    { enterprise: false, requireConsent: true, expected: true },
    { enterprise: true, requireConsent: true, expected: true },
    { enterprise: true, requireConsent: false, expected: false },
  ])("returns $expected when enterprise=$enterprise and SUPPORT_ACCESS_REQUIRE_CONSENT=$requireConsent", async ({
    enterprise,
    requireConsent,
    expected,
  }) => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(enterprise)
    mocks.keys.mockReturnValue({
      SUPPORT_ACCESS_REQUIRE_CONSENT: requireConsent,
    })

    await expect(isSupportConsentRequired()).resolves.toBe(expected)
  })

  test("honors a raw false value when environment validation is skipped", async () => {
    mocks.hasEnterpriseFeatures.mockResolvedValue(true)
    mocks.keys.mockReturnValue({
      SUPPORT_ACCESS_REQUIRE_CONSENT: "false",
    })

    await expect(isSupportConsentRequired()).resolves.toBe(false)
  })
})
