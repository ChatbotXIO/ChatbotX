// @vitest-environment node

import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  nav: vi.fn(() => null),
  resolveEntry: vi.fn(async () => true),
  channels: vi.fn(async () => ["whatsapp"]),
  permissions: vi.fn(() => true),
}))

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found")
  },
}))
vi.mock("@/features/analytics/components/analytics-nav", () => ({
  AnalyticsNav: mocks.nav,
}))
vi.mock("@/features/analytics/lib/ads-dashboard-channels", () => ({
  resolveAdsDashboardChannels: mocks.channels,
}))
vi.mock("@/features/analytics/lib/google-ads-dashboard-entry", () => ({
  resolveGoogleAdsDashboardEntry: mocks.resolveEntry,
}))
vi.mock("@/lib/auth/permission-routes", () => ({
  hasWorkspacePermission: mocks.permissions,
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: async () => ({
    targetWorkspace: { createdAt: new Date("2026-01-01") },
    targetWorkspaceMember: { permissions: {} },
  }),
}))
vi.mock("@chatbotx.io/analytics-nextjs/components/contacts-dashboard", () => ({
  ContactsDashboard: ({ nav }: { nav: ReactNode }) => nav,
}))
vi.mock(
  "@chatbotx.io/analytics-nextjs/components/conversations-dashboard",
  () => ({ ConversationsDashboard: ({ nav }: { nav: ReactNode }) => nav }),
)

const { default: ContactsPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/contacts/page"
)
const { default: ConversationsPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/conversations/page"
)

const params = Promise.resolve({ workspaceId: "ws-1" })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveEntry.mockResolvedValue(true)
  mocks.permissions.mockReturnValue(true)
})

describe.each([
  ["contacts", ContactsPage],
  ["conversations", ConversationsPage],
])("%s dashboard page", (_name, Page) => {
  test("passes the resolved Google Ads entry to the nav", async () => {
    renderToStaticMarkup(await Page({ params }))

    expect(mocks.resolveEntry).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      isSuperAdmin: true,
    })
    expect(mocks.nav).toHaveBeenCalledWith(
      { adsChannels: ["whatsapp"], showGoogleAds: true },
      undefined,
    )
  })

  test("passes false when the resolver says the entry is hidden", async () => {
    mocks.resolveEntry.mockResolvedValue(false)

    renderToStaticMarkup(await Page({ params }))

    expect(mocks.nav).toHaveBeenCalledWith(
      expect.objectContaining({ showGoogleAds: false }),
      undefined,
    )
  })
})
