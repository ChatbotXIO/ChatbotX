// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdAccountFilter } from "@/features/ads/components/ad-account-filter"
import type { AdsAnalyticsSearchParams } from "@/features/ads/schema/analytics"

const navigation = vi.hoisted(() => ({
  pathname: "/space/ws-1/dashboard/ads/messenger",
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}))

const listChannelAdAccounts = vi.hoisted(() => vi.fn())

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => navigation.searchParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    adsAPI: {
      listChannelAdAccounts,
    },
  },
}))

vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({
    items,
    onValueChange,
    value,
  }: {
    items: Array<{ label: string; value: string }>
    onValueChange: (value: string) => void
    value: string
    children: ReactNode
  }) => (
    <select
      aria-label="ads.analytics.adAccountFilter.label"
      onChange={(event) => onValueChange(event.currentTarget.value)}
      value={value}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
}))

vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { render: ReactNode }) => render,
}))

const range = {
  account: "",
  channelAccount: "iw-1",
  adAccount: "",
  from: "2026-08-01",
  to: "2026-08-10",
  tz: "",
} as AdsAnalyticsSearchParams

const flushMicrotasks = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

describe("AdAccountFilter", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigation.push.mockClear()
    navigation.searchParams = new URLSearchParams(
      "from=2026-08-01&to=2026-08-10&channelAccount=iw-1",
    )
    listChannelAdAccounts.mockReset()
    listChannelAdAccounts.mockResolvedValue({
      data: [
        { id: "act_1", name: "Primary Ads" },
        { id: "act_2", name: null },
      ],
    })
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
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

  async function renderFilter(
    selectedChannelIntegrationId: string | null = "iw-1",
  ) {
    const callsBefore = listChannelAdAccounts.mock.calls.length
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AdAccountFilter
            channel="messenger"
            range={range}
            selectedChannelIntegrationId={selectedChannelIntegrationId}
            workspaceId="ws-1"
          />
        </QueryClientProvider>,
      )
    })
    await vi.waitFor(() => {
      expect(listChannelAdAccounts.mock.calls.length).toBeGreaterThan(
        callsBefore,
      )
    })
    await flushMicrotasks()
  }

  test("renders account options and preserves URL params when selecting", async () => {
    await renderFilter()

    await vi.waitFor(() => {
      expect(container.textContent).toContain(
        "ads.analytics.adAccountFilter.all",
      )
      expect(container.textContent).toContain("Primary Ads")
      expect(container.textContent).toContain("act_2")
    })

    act(() => {
      const select = container.querySelector<HTMLSelectElement>("select")
      if (!select) {
        throw new Error("ad account select not rendered")
      }
      select.value = "act_1"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(navigation.push).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/messenger?from=2026-08-01&to=2026-08-10&channelAccount=iw-1&adAccount=act_1",
    )
  })

  test("fetches with workspaceId, channel and the selected integration", async () => {
    await renderFilter("iw-1")

    expect(listChannelAdAccounts.mock.calls.at(-1)?.[0]).toEqual({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "iw-1",
    })
  })

  test("switching the selected integration refetches with the new integrationId", async () => {
    await renderFilter("iw-1")
    await renderFilter("iw-2")

    expect(listChannelAdAccounts).toHaveBeenCalledTimes(2)
    expect(listChannelAdAccounts.mock.calls[0]?.[0]).toEqual({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "iw-1",
    })
    expect(listChannelAdAccounts.mock.calls[1]?.[0]).toEqual({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "iw-2",
    })
  })

  test("falls back to All ad accounts when the selected adAccount isn't in the narrowed list", async () => {
    listChannelAdAccounts.mockResolvedValue({
      data: [{ id: "act_9", name: "Other Account" }],
    })

    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AdAccountFilter
            channel="messenger"
            range={{ ...range, adAccount: "act_1" }}
            selectedChannelIntegrationId="iw-2"
            workspaceId="ws-1"
          />
        </QueryClientProvider>,
      )
    })
    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select")
      expect(select?.value).toBe("")
    })
  })

  test("renders a disabled select with the unavailable note on a request error (never vanishes silently)", async () => {
    listChannelAdAccounts.mockRejectedValue(new Error("not connected"))

    await renderFilter()

    // The control must stay visible so the user can see WHY it is unusable
    // (e.g. the integration's or workspace's Ads connection needs attention)
    // instead of the filter silently disappearing. (The Select mock is a
    // passthrough, so the disabled prop itself isn't observable here — the
    // rendered unavailable note is the contract.)
    await vi.waitFor(() => {
      expect(container.textContent).toContain(
        "ads.analytics.adAccountFilter.unavailable",
      )
    })
  })
})
