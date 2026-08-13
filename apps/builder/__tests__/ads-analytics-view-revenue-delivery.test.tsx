// @vitest-environment jsdom

import type { CapiDeliverySummary } from "@chatbotx.io/business"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdsAnalyticsView } from "@/features/ads/components/ads-analytics-view"
import type { AdsAnalyticsData } from "@/features/ads/lib/merge-analytics"
import type { AdsAnalyticsTimeseriesRow } from "@/features/ads/queries/analytics"
import type { AdsAnalyticsSearchParams } from "@/features/ads/schemas/analytics"

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/ads/analytics",
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn(), isPending: false }),
}))

vi.mock("swr", () => ({
  default: () => ({ data: undefined, error: undefined, isLoading: false }),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    integrationFacebookAdsAPI: {
      listAdAccounts: vi.fn(),
      listCustomAudiences: vi.fn(),
    },
  },
}))

vi.mock("@/features/ads/actions/retarget", () => ({
  retargetAdAction: vi.fn(),
}))

vi.mock("@/features/ads/components/ads-account-control", () => ({
  AdsAccountControl: () => null,
}))

vi.mock("@/features/ads/components/ads-performance-chart", () => ({
  AdsPerformanceChart: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
  }: {
    children: ReactNode
    onOpenChange: (open: boolean) => void
    open: boolean
  }) => (open ? children : null),
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogDescription: ({ children }: { children: ReactNode }) => children,
  DialogFooter: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@chatbotx.io/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => children,
  DropdownMenuPortal: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => children,
  DropdownMenuTrigger: ({
    children,
    render,
  }: {
    children?: ReactNode
    render?: ReactNode
  }) => render ?? children,
}))

vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => children,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children }: { children: ReactNode }) => children,
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({
    children,
    render,
  }: {
    children?: ReactNode
    render?: ReactNode
  }) => render ?? children,
}))

const analyticsData = {
  totals: {
    conversations: 10,
    leads: 4,
    purchases: 2,
    revenue: 250,
    spend: 100,
    costPerLead: 25,
    costPerPurchase: 50,
    roas: 2.5,
    impressions: 5000,
    clicks: 200,
    cpc: 0.5,
    ctr: 0.04,
    cpm: 20,
    costPerConversation: 10,
  },
  perAd: [
    {
      adId: "ad-1",
      adName: "Ad One",
      conversations: 10,
      leads: 4,
      purchases: 2,
      revenue: 250,
      spend: 100,
      costPerLead: 25,
      costPerPurchase: 50,
      roas: 2.5,
      impressions: 5000,
      clicks: 200,
      cpc: 0.5,
      ctr: 0.04,
      cpm: 20,
      costPerConversation: 10,
    },
  ],
} satisfies AdsAnalyticsData

const deliverySummary = {
  sent: 5,
  pending: 1,
  failed: 2,
  skippedNoScope: 3,
  skippedRegion: 0,
} satisfies CapiDeliverySummary

const timeseries = [
  { date: "2026-08-01", conversations: 10, leads: 4, purchases: 2, spend: 100 },
] satisfies AdsAnalyticsTimeseriesRow[]

const range = {
  from: "2026-08-01",
  to: "2026-08-10",
  account: "",
  adAccount: "",
} as AdsAnalyticsSearchParams

describe("AdsAnalyticsView revenue and delivery", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("renders revenue, ROAS, and delivery status details", async () => {
    await act(async () => {
      root.render(
        <AdsAnalyticsView
          promises={Promise.resolve([
            analyticsData,
            deliverySummary,
            timeseries,
          ])}
          range={range}
          selectedIntegrationWhatsappId="iw-1"
          switcherIntegrations={[]}
          whatsappCredentialPublic={null}
          workspaceId="ws-1"
        />,
      )
      await Promise.resolve()
    })

    expect(container.textContent).toContain("ads.analytics.revenue")
    expect(container.textContent).toContain("ads.analytics.roas")
    expect(container.textContent).toContain("2.50x")
    expect(container.textContent).toContain("ads.analytics.impressions")
    expect(container.textContent).toContain("5,000")
    expect(container.textContent).toContain("ads.analytics.clicks")
    expect(container.textContent).toContain("200")
    expect(container.textContent).toContain("ads.analytics.cpc")
    expect(container.textContent).toContain("ads.analytics.ctr")
    expect(container.textContent).toContain("4.00%")
    expect(container.textContent).toContain("ads.analytics.cpm")
    expect(container.textContent).toContain("ads.analytics.costPerConversation")
    expect(container.textContent).toContain("ads.analytics.delivery.title")
    expect(container.textContent).toContain("ads.analytics.delivery.sent")
    expect(container.textContent).toContain(
      "ads.analytics.delivery.skippedNoScope",
    )
    expect(container.textContent).toContain(
      "ads.analytics.delivery.noScopeWarning",
    )
    expect(container.textContent).toContain(
      "ads.analytics.delivery.reconnectCta",
    )
    expect(
      Array.from(container.querySelectorAll("a")).some((anchor) =>
        anchor.href.includes("/ads/connect-accounts"),
      ),
    ).toBe(true)
    expect(container.textContent).not.toContain(
      "ads.analytics.delivery.skippedRegion",
    )
  })
})
