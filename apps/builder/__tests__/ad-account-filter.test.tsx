// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdAccountFilter } from "@/features/ads/components/ad-account-filter"
import type { AdsAnalyticsSearchParams } from "@/features/ads/schemas/analytics"

const navigation = vi.hoisted(() => ({
  pathname: "/space/ws-1/ads/analytics",
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

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: navigation.push }),
  useSearchParams: () => navigation.searchParams,
}))

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("swr", () => ({
  default: () => ({
    data: swrState.data,
    error: swrState.error,
    isLoading: swrState.isLoading,
  }),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    integrationFacebookAdsAPI: {
      listAdAccounts: vi.fn(),
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
  account: "iw-1",
  adAccount: "",
  from: "2026-08-01",
  to: "2026-08-10",
} as AdsAnalyticsSearchParams

describe("AdAccountFilter", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    navigation.push.mockClear()
    navigation.searchParams = new URLSearchParams(
      "from=2026-08-01&to=2026-08-10&account=iw-1",
    )
    swrState.data = {
      data: [
        { id: "act_1", name: "Primary Ads" },
        { id: "act_2", name: null },
      ],
    }
    swrState.error = undefined
    swrState.isLoading = false
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

  function renderFilter() {
    act(() => {
      root.render(<AdAccountFilter range={range} workspaceId="ws-1" />)
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
      "/space/ws-1/ads/analytics?from=2026-08-01&to=2026-08-10&account=iw-1&adAccount=act_1",
    )
  })

  test("returns null on SWR error", () => {
    swrState.data = undefined
    swrState.error = new Error("not connected")

    renderFilter()

    expect(container.textContent).toBe("")
  })
})
