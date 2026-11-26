// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  channels: vi.fn(async () => [] as string[]),
  googleEntry: vi.fn(async () => false),
}))

vi.mock("@/features/analytics/lib/ads-dashboard-channels", () => ({
  resolveAdsDashboardChannels: mocks.channels,
}))
vi.mock("@/features/analytics/lib/google-ads-dashboard-entry", () => ({
  resolveGoogleAdsDashboardEntry: mocks.googleEntry,
}))

const {
  ANALYTICS_SECTIONS,
  analyticsSectionOption,
  resolveActiveAnalyticsSection,
  sectionReadsSelectionOnServer,
  visibleAnalyticsSections,
} = await import("@/features/analytics/lib/analytics-sections")
const { resolveAnalyticsSections } = await import(
  "@/features/analytics/lib/resolve-analytics-sections"
)

const ids = (sections: { id: string }[]) => sections.map((s) => s.id)

describe("visibleAnalyticsSections", () => {
  test("a workspace with no ads still lists Contacts, Conversations and Posts, in that order", () => {
    expect(
      ids(visibleAnalyticsSections({ adsChannels: [], showGoogleAds: false })),
    ).toEqual(["contacts", "conversations", "posts"])
  })

  test("lists the connected ads channels in registry order, then Google Ads", () => {
    expect(
      ids(
        visibleAnalyticsSections({
          adsChannels: ["instagram", "whatsapp"],
          showGoogleAds: true,
        }),
      ),
    ).toEqual([
      "contacts",
      "conversations",
      "posts",
      "ads-whatsapp",
      "ads-instagram",
      "ads-google",
    ])
  })

  test("Google Ads works without any Meta channel", () => {
    expect(
      ids(visibleAnalyticsSections({ adsChannels: [], showGoogleAds: true })),
    ).toContain("ads-google")
  })

  test("every section has a unique id and segment", () => {
    expect(new Set(ANALYTICS_SECTIONS.map((s) => s.id)).size).toBe(
      ANALYTICS_SECTIONS.length,
    )
    expect(new Set(ANALYTICS_SECTIONS.map((s) => s.segment)).size).toBe(
      ANALYTICS_SECTIONS.length,
    )
  })
})

describe("resolveActiveAnalyticsSection", () => {
  test.each([
    ["/space/ws-1/dashboard/contacts", "contacts"],
    ["/space/ws-1/dashboard/posts", "posts"],
    ["/space/ws-1/dashboard/ads/messenger", "ads-messenger"],
    ["/space/ws-1/dashboard/ads/google/", "ads-google"],
  ])("%s is the %s section", (pathname, id) => {
    const active = resolveActiveAnalyticsSection(pathname)

    expect(active?.section.id).toBe(id)
    expect(active?.base).toBe("/space/ws-1/dashboard")
  })

  test.each([
    "/space/ws-1/dashboard",
    "/space/ws-1/dashboard/ads/conversion-events",
    "/space/ws-1/posts",
  ])("%s is not a section", (pathname) => {
    expect(resolveActiveAnalyticsSection(pathname)).toBeNull()
  })

  test("analyticsSectionOption returns the registry entry", () => {
    expect(analyticsSectionOption("ads-instagram").segment).toBe(
      "ads/instagram",
    )
  })
})

describe("resolveAnalyticsSections", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.channels.mockResolvedValue([])
    mocks.googleEntry.mockResolvedValue(false)
  })

  test("a member without analytics gets nothing and nothing is queried", async () => {
    const result = await resolveAnalyticsSections({
      workspaceId: "ws-1",
      permissions: { analytics: false, superAdmin: true },
    })

    expect(result).toEqual([])
    expect(mocks.channels).not.toHaveBeenCalled()
  })

  test("passes superAdmin to both ads resolvers", async () => {
    await resolveAnalyticsSections({
      workspaceId: "ws-1",
      permissions: { analytics: true, superAdmin: false },
    })

    expect(mocks.channels).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      isSuperAdmin: false,
    })
    expect(mocks.googleEntry).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      isSuperAdmin: false,
    })
  })

  test("lists the connected ads channels and Google Ads for a superAdmin", async () => {
    mocks.channels.mockResolvedValue(["whatsapp"])
    mocks.googleEntry.mockResolvedValue(true)

    const result = await resolveAnalyticsSections({
      workspaceId: "ws-1",
      permissions: { analytics: true, superAdmin: true },
    })

    expect(ids(result)).toEqual([
      "contacts",
      "conversations",
      "posts",
      "ads-whatsapp",
      "ads-google",
    ])
  })

  test("a member who is not superAdmin gets no ads sections", async () => {
    const result = await resolveAnalyticsSections({
      workspaceId: "ws-1",
      permissions: { analytics: true, superAdmin: false },
    })

    expect(ids(result)).toEqual(["contacts", "conversations", "posts"])
  })
})

describe("analyticsSectionOption", () => {
  test("a registered option carries only its id and segment", () => {
    expect(analyticsSectionOption("posts")).toEqual({
      id: "posts",
      segment: "posts",
    })
  })
})

describe("sectionReadsSelectionOnServer", () => {
  test("only the Ads sections re-render on the server when the shared selection changes", () => {
    expect(
      ANALYTICS_SECTIONS.filter((section) =>
        sectionReadsSelectionOnServer(section.id),
      ).map((section) => section.id),
    ).toEqual(["ads-whatsapp", "ads-messenger", "ads-instagram", "ads-google"])
  })
})
