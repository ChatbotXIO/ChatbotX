// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getSetup: vi.fn(),
  hasAnyEvent: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationGoogleAdsService: { getSetup: mocks.getSetup },
  googleAdsConversionService: { hasAnyEvent: mocks.hasAnyEvent },
}))

const { resolveGoogleAdsDashboardEntry } = await import(
  "../src/features/analytics/lib/google-ads-dashboard-entry"
)

const CONNECTED = { integration: {} }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getSetup.mockResolvedValue(null)
  mocks.hasAnyEvent.mockResolvedValue(false)
})

describe("resolveGoogleAdsDashboardEntry", () => {
  test("is false for a non-super-admin without touching the business layer", async () => {
    mocks.getSetup.mockResolvedValue(CONNECTED)
    mocks.hasAnyEvent.mockResolvedValue(true)

    const result = await resolveGoogleAdsDashboardEntry({
      workspaceId: "ws-1",
      isSuperAdmin: false,
    })

    expect(result).toBe(false)
    expect(mocks.getSetup).not.toHaveBeenCalled()
    expect(mocks.hasAnyEvent).not.toHaveBeenCalled()
  })

  test.each([
    ["connected", CONNECTED, false, true],
    [
      "history only (the check ignores the selected date range)",
      null,
      true,
      true,
    ],
    ["neither", null, false, false],
  ])("super admin, %s", async (_name, setup, hasEvent, expected) => {
    mocks.getSetup.mockResolvedValue(setup)
    mocks.hasAnyEvent.mockResolvedValue(hasEvent)

    const result = await resolveGoogleAdsDashboardEntry({
      workspaceId: "ws-1",
      isSuperAdmin: true,
    })

    expect(result).toBe(expected)
    expect(mocks.getSetup).toHaveBeenCalledWith("ws-1")
  })

  test("a connection short-circuits the history lookup", async () => {
    mocks.getSetup.mockResolvedValue(CONNECTED)

    await resolveGoogleAdsDashboardEntry({
      workspaceId: "ws-1",
      isSuperAdmin: true,
    })

    expect(mocks.hasAnyEvent).not.toHaveBeenCalled()
  })
})
