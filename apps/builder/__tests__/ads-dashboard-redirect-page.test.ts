// @vitest-environment node

import { describe, expect, test, vi } from "vitest"

const mockRedirect = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

const { default: AdsAnalyticsRedirectPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/ads/page"
)

describe("Ads dashboard channel-less redirect", () => {
  test("redirects to /dashboard/ads/whatsapp with no search params", async () => {
    await AdsAnalyticsRedirectPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
      searchParams: Promise.resolve({}),
    })

    expect(mockRedirect).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/whatsapp",
    )
  })

  test("preserves the legacy CAPI-connect ?account=<id> query param", async () => {
    await AdsAnalyticsRedirectPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
      searchParams: Promise.resolve({ account: "iw-2" }),
    })

    expect(mockRedirect).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/whatsapp?account=iw-2",
    )
  })

  test("preserves multiple params (old bookmark with date range filters)", async () => {
    await AdsAnalyticsRedirectPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
      searchParams: Promise.resolve({
        account: "iw-2",
        from: "2026-08-01",
        to: "2026-08-10",
      }),
    })

    expect(mockRedirect).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/whatsapp?account=iw-2&from=2026-08-01&to=2026-08-10",
    )
  })

  test("lands on the channel from a stale ?channel= bookmark instead of WhatsApp", async () => {
    await AdsAnalyticsRedirectPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
      searchParams: Promise.resolve({
        channel: "messenger",
        from: "2026-08-01",
      }),
    })

    expect(mockRedirect).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/messenger?channel=messenger&from=2026-08-01",
    )
  })

  test("falls back to the default channel for the old `all` aggregate sentinel", async () => {
    await AdsAnalyticsRedirectPage({
      params: Promise.resolve({ workspaceId: "ws-1" }),
      searchParams: Promise.resolve({ channel: "all" }),
    })

    expect(mockRedirect).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/whatsapp?channel=all",
    )
  })
})
