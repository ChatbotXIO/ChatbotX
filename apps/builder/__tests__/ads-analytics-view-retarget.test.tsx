// @vitest-environment jsdom

import type { CapiDeliverySummary } from "@chatbotx.io/business"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdsAnalyticsView } from "@/features/ads/components/ads-analytics-view"
import type { AdsAnalyticsData } from "@/features/ads/lib/merge-analytics"
import type { AdsAnalyticsTimeseriesRow } from "@/features/ads/queries/analytics"
import type { AdsAnalyticsSearchParams } from "@/features/ads/schemas/analytics"

const mockExecute = vi.fn()
const mockPush = vi.fn()

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/dashboard/ads/whatsapp",
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
  useLocale: () => "en",
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    _action: unknown,
    handlers: { onSuccess?: () => void; onError?: (e: unknown) => void },
  ) => ({
    execute: (input: unknown) => {
      mockExecute(input)
      handlers.onSuccess?.()
    },
    isPending: false,
  }),
}))

// Supplies an ad account so the retarget dialog's `adAccountId` auto-selects
// (mirrors the real `useEffect` that reads `adAccounts.data.data[0]`),
// letting the confirm button reach an enabled state in these tests.
vi.mock("swr", () => ({
  default: (key: unknown) => {
    if (Array.isArray(key) && key[0] === "facebook-ads-ad-accounts") {
      return {
        data: { data: [{ id: "act_1", name: "Ad Account" }] },
        error: undefined,
        isLoading: false,
      }
    }
    return { data: undefined, error: undefined, isLoading: false }
  },
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
  retargetAdAction: { bind: () => "bound-action" },
}))

vi.mock("@/features/ads/components/ads-account-control", () => ({
  AdsAccountControl: () => null,
}))

vi.mock("@/features/ads/components/ads-performance-chart", () => ({
  AdsPerformanceChart: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-testid="retarget-dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogDescription: ({ children }: { children: ReactNode }) => children,
  DialogFooter: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
}))

// `DropdownMenuItem`/`DropdownMenuSubTrigger` render as real DOM elements
// (not no-ops) so tests can click through the retarget menu.
vi.mock("@chatbotx.io/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button data-menu-item onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuPortal: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => (
    <div data-sub-trigger>{children}</div>
  ),
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

const baseRange = {
  from: "2026-08-01",
  to: "2026-08-10",
  account: "",
  channelAccount: "",
  adAccount: "",
} as Omit<AdsAnalyticsSearchParams, "channel">

const singleChannelRow = {
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
}

const emptyTotals = {
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
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("AdsAnalyticsView — single-channel retarget row actions", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mockExecute.mockClear()
    mockPush.mockClear()
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

  test("renders one badge for the page's channel and one direct entry set (no per-channel submenu)", async () => {
    const data: AdsAnalyticsData = {
      totals: emptyTotals,
      perAd: [singleChannelRow],
      spendCurrency: null,
    }

    await act(async () => {
      root.render(
        <AdsAnalyticsView
          channel="whatsapp"
          channelIntegrations={[]}
          promises={Promise.resolve([data, deliverySummary, timeseries])}
          range={{ ...baseRange }}
          selectedChannelIntegrationId={null}
          workspaceCreatedAt={new Date("2024-01-01T00:00:00.000Z")}
          workspaceId="ws-1"
        />,
      )
      await flush()
    })

    expect(container.textContent).toContain(
      "ads.conversionEvents.tabs.whatsapp",
    )
    // Single-channel view: one direct entry set, no per-channel submenu label.
    expect(container.textContent).not.toContain("retargetOnChannel")
  })

  test("selecting a retarget entry keeps preserving the selected integration (regression)", async () => {
    const data: AdsAnalyticsData = {
      totals: emptyTotals,
      perAd: [singleChannelRow],
      spendCurrency: null,
    }

    await act(async () => {
      root.render(
        <AdsAnalyticsView
          channel="whatsapp"
          channelIntegrations={[]}
          promises={Promise.resolve([data, deliverySummary, timeseries])}
          range={{ ...baseRange }}
          selectedChannelIntegrationId="iw-1"
          workspaceCreatedAt={new Date("2024-01-01T00:00:00.000Z")}
          workspaceId="ws-1"
        />,
      )
      await flush()
    })

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-menu-item]"),
    )
    const purchasesButton = buttons.find(
      (button) => button.textContent === "ads.analytics.thoseWhoPurchased",
    )

    await act(async () => {
      purchasesButton?.click()
      await flush()
    })

    const confirmButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (button) => button.textContent === "ads.analytics.retargetDialog.confirm",
    )

    await act(async () => {
      confirmButton?.click()
      await flush()
    })

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        integrationWhatsappId: "iw-1",
        integrationMessengerId: undefined,
        integrationInstagramId: undefined,
      }),
    )
  })
})
