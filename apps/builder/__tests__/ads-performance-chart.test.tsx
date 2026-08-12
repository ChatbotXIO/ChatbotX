// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AdsPerformanceChart } from "@/features/ads/components/ads-performance-chart"
import type { AdsAnalyticsTimeseriesRow } from "@/features/ads/queries/analytics"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

// jsdom ships no ResizeObserver, and recharts' ResponsiveContainer measures
// its wrapper through it.
Object.assign(globalThis, {
  ResizeObserver: class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
})

// jsdom reports 0x0 for every element, so ResponsiveContainer would skip
// rendering its children entirely — pin a non-zero size like recharts'
// own test setup does.
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  value: 600,
})
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  value: 300,
})
HTMLElement.prototype.getBoundingClientRect = () =>
  ({
    width: 600,
    height: 300,
    top: 0,
    left: 0,
    right: 600,
    bottom: 300,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  }) as DOMRect

describe("AdsPerformanceChart", () => {
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

  test("renders legend labels for conversations, leads, purchases, and spend", async () => {
    const data = [
      {
        date: "2026-08-01",
        conversations: 3,
        leads: 1,
        purchases: 0,
        spend: 10,
      },
      {
        date: "2026-08-02",
        conversations: 2,
        leads: 1,
        purchases: 1,
        spend: 20,
      },
    ] satisfies AdsAnalyticsTimeseriesRow[]

    await act(async () => {
      root.render(<AdsPerformanceChart data={data} />)
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      "ads.analytics.performanceChart.title",
    )
    expect(container.textContent).toContain(
      "ads.analytics.conversationsStarted",
    )
    expect(container.textContent).toContain("ads.analytics.qualifiedLeads")
    expect(container.textContent).toContain("ads.analytics.purchases")
    expect(container.textContent).toContain("ads.analytics.adSpend")
    expect(container.textContent).not.toContain(
      "ads.analytics.performanceChart.empty",
    )
  })

  test("shows the empty state when every day has zero conversations, leads, purchases, and spend", async () => {
    const data = [
      {
        date: "2026-08-01",
        conversations: 0,
        leads: 0,
        purchases: 0,
        spend: null,
      },
      {
        date: "2026-08-02",
        conversations: 0,
        leads: 0,
        purchases: 0,
        spend: null,
      },
    ] satisfies AdsAnalyticsTimeseriesRow[]

    await act(async () => {
      root.render(<AdsPerformanceChart data={data} />)
      await Promise.resolve()
    })

    expect(container.textContent).toContain(
      "ads.analytics.performanceChart.empty",
    )
  })
})
