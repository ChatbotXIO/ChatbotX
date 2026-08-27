// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdAccountFilter } from "@/features/ads/components/ad-account-filter"
import type { AdsAnalyticsSearchParams } from "@/features/ads/schemas/analytics"

const navigation = vi.hoisted(() => ({
  pathname: "/space/ws-1/dashboard/ads/messenger",
  push: vi.fn(),
  searchParams: new URLSearchParams(),
}))

const swrState = vi.hoisted(() => ({
  data: undefined as
    | { data: Array<{ id: string; name?: string | null }> }
    | undefined,
  error: undefined as Error | undefined,
  isLoading: false,
}))

const swr = vi.hoisted(() => ({
  keys: [] as unknown[],
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

vi.mock("swr", () => ({
  // Records the key SWR was called with (asserting on it below) and eagerly
  // invokes the fetcher so a re-render with a different key is observable as
  // an extra `listChannelAdAccounts` call — same "did the key change trigger
  // a refetch" contract SWR itself provides, without needing the real async
  // SWR cache in this synchronous render harness.
  default: (key: unknown, fetcher: () => unknown) => {
    swr.keys.push(key)
    if (key) {
      fetcher()
    }
    return {
      data: swrState.data,
      error: swrState.error,
      isLoading: swrState.isLoading,
    }
  },
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

describe("AdAccountFilter", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigation.push.mockClear()
    navigation.searchParams = new URLSearchParams(
      "from=2026-08-01&to=2026-08-10&channelAccount=iw-1",
    )
    swrState.data = {
      data: [
        { id: "act_1", name: "Primary Ads" },
        { id: "act_2", name: null },
      ],
    }
    swrState.error = undefined
    swrState.isLoading = false
    swr.keys.length = 0
    listChannelAdAccounts.mockClear()
    listChannelAdAccounts.mockResolvedValue({ data: [] })
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

  function renderFilter(selectedChannelIntegrationId: string | null = "iw-1") {
    act(() => {
      root.render(
        <AdAccountFilter
          channel="messenger"
          range={range}
          selectedChannelIntegrationId={selectedChannelIntegrationId}
          workspaceId="ws-1"
        />,
      )
    })
  }

  test("renders account options and preserves URL params when selecting", () => {
    renderFilter()

    expect(container.textContent).toContain("ads.analytics.adAccountFilter.all")
    expect(container.textContent).toContain("Primary Ads")
    expect(container.textContent).toContain("act_2")

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

  test("SWR key includes workspaceId, channel and the selected integration", () => {
    renderFilter("iw-1")

    expect(swr.keys.at(-1)).toEqual([
      "ads-channel-ad-accounts",
      "ws-1",
      "messenger",
      "iw-1",
    ])
    expect(listChannelAdAccounts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "iw-1",
    })
  })

  test("switching the selected integration changes the SWR key and refetches", () => {
    renderFilter("iw-1")
    renderFilter("iw-2")

    expect(swr.keys).toEqual([
      ["ads-channel-ad-accounts", "ws-1", "messenger", "iw-1"],
      ["ads-channel-ad-accounts", "ws-1", "messenger", "iw-2"],
    ])
    expect(listChannelAdAccounts).toHaveBeenCalledTimes(2)
    expect(listChannelAdAccounts).toHaveBeenNthCalledWith(1, {
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "iw-1",
    })
    expect(listChannelAdAccounts).toHaveBeenNthCalledWith(2, {
      workspaceId: "ws-1",
      channel: "messenger",
      integrationId: "iw-2",
    })
  })

  test("falls back to All ad accounts when the selected adAccount isn't in the narrowed list", () => {
    swrState.data = { data: [{ id: "act_9", name: "Other Account" }] }

    act(() => {
      root.render(
        <AdAccountFilter
          channel="messenger"
          range={{ ...range, adAccount: "act_1" }}
          selectedChannelIntegrationId="iw-2"
          workspaceId="ws-1"
        />,
      )
    })

    const select = container.querySelector<HTMLSelectElement>("select")
    expect(select?.value).toBe("")
  })

  test("renders a disabled select with the unavailable note on SWR error (never vanishes silently)", () => {
    swrState.data = undefined
    swrState.error = new Error("not connected")

    renderFilter()

    // The control must stay visible so the user can see WHY it is unusable
    // (e.g. the integration's or workspace's Ads connection needs attention)
    // instead of the filter silently disappearing. (The Select mock is a
    // passthrough, so the disabled prop itself isn't observable here — the
    // rendered unavailable note is the contract.)
    expect(container.textContent).not.toBe("")
    expect(container.textContent).toContain(
      "ads.analytics.adAccountFilter.unavailable",
    )
  })
})
