// @vitest-environment jsdom
import type { GoogleAdsStatsResponse } from "@chatbotx.io/business"
import type { ComponentProps, ReactElement, ReactNode } from "react"
import { act, cloneElement } from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: new URLSearchParams(),
  isPending: false,
  barChartData: undefined as unknown,
  labelFormatter: undefined as ((value: unknown) => string) | undefined,
}))

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useTransition: () => [mocks.isPending, (callback: () => void) => callback()],
}))
vi.mock("next-intl", async () => ({
  ...(await import("./helpers/google-ads-ui")).nextIntlMock(),
  useLocale: () => "en",
}))
vi.mock("next/navigation", () => ({
  usePathname: () => "/space/ws-1/dashboard/ads/google",
  useParams: () => ({ workspaceId: "ws-1" }),
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  useSearchParams: () => mocks.search,
}))
vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <select
      data-testid="select"
      onChange={(event) => onValueChange(event.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ "aria-label": label }: { "aria-label"?: string }) => (
    <span data-testid="select-label">{label}</span>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))
// Tooltip content is always rendered so tests can read it.
vi.mock("@chatbotx.io/ui/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    render,
    children,
  }: {
    render: ReactElement
    children?: ReactNode
  }) => cloneElement(render, undefined, children),
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}))
vi.mock(
  "@chatbotx.io/analytics-nextjs/components/date-range-preset-filter",
  () => ({
    resolvePresetOption: () => "custom",
    DateRangePresetFilter: ({
      onChange,
    }: {
      onChange: (range: { from: Date; to: Date }) => void
    }) => (
      <button
        data-testid="pick-range"
        onClick={() =>
          onChange({ from: new Date(2026, 0, 1), to: new Date(2026, 0, 7) })
        }
        type="button"
      />
    ),
  }),
)
vi.mock("@chatbotx.io/ui/components/ui/chart", () => ({
  ChartContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="chart">{children}</div>
  ),
  ChartLegend: () => null,
  ChartLegendContent: () => null,
  ChartTooltip: ({ content }: { content: ReactNode }) => <>{content}</>,
  ChartTooltipContent: ({
    labelFormatter,
  }: {
    labelFormatter?: (value: unknown) => string
  }) => {
    // The outcome donut's tooltip has no label formatter; only the day chart's counts.
    if (labelFormatter) {
      mocks.labelFormatter = labelFormatter
    }
    return null
  },
}))
vi.mock("recharts", () => ({
  BarChart: ({ data, children }: { data: unknown; children: ReactNode }) => {
    mocks.barChartData = data
    return <>{children}</>
  },
  Bar: () => null,
  Cell: () => null,
  Pie: () => null,
  PieChart: ({ children }: { children: ReactNode }) => <>{children}</>,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
}))

import { GoogleAdsStatsView } from "@/features/integration-google-ads/components/stats/google-ads-stats-view"
import {
  buttonByText,
  click,
  type Mounted,
  mount,
} from "./helpers/google-ads-ui"

let ui: Mounted
beforeEach(() => {
  ui = mount()
  mocks.push.mockReset()
  mocks.replace.mockReset()
  mocks.search = new URLSearchParams("tz=Asia%2FHo_Chi_Minh")
  mocks.isPending = false
  mocks.barChartData = undefined
})
afterEach(() => {
  ui.unmount()
  vi.restoreAllMocks()
})

const counts = (overrides: Partial<Record<string, number>> = {}) => ({
  pending: 0,
  sending: 0,
  sent: 0,
  processed: 0,
  failed: 0,
  skipped_no_account: 0,
  skipped_expired: 0,
  ...overrides,
})

const stats = (
  overrides: Partial<GoogleAdsStatsResponse> = {},
): GoogleAdsStatsResponse => ({
  range: { from: "2026-09-01", to: "2026-09-02", tz: "Asia/Ho_Chi_Minh" },
  totals: {
    ...counts({
      pending: 1,
      sending: 1,
      sent: 6,
      processed: 3,
      failed: 1,
      skipped_no_account: 2,
      skipped_expired: 1,
    }),
    total: 15,
    deliveryRate: 0.75,
  },
  failuresByStage: { delivery: 1, processing: 0, timeout: 0, unknown: 0 },
  confirmedValue: [],
  timeseries: [
    { date: "2026-09-01", counts: counts({ processed: 2, sent: 4 }) },
    {
      date: "2026-09-02",
      counts: counts({ processed: 1, pending: 1, sending: 1, failed: 1 }),
    },
  ],
  byAction: [
    {
      conversionActionId: "111",
      name: "Purchase",
      category: "PURCHASE",
      total: 10,
      counts: counts({ processed: 3, sent: 6, failed: 1 }),
    },
    {
      conversionActionId: "222",
      name: null,
      category: null,
      total: 5,
      counts: counts({ pending: 1, skipped_no_account: 2 }),
    },
  ],
  byActionTruncated: false,
  byChannel: [
    { channel: "whatsapp", total: 10, counts: counts({ processed: 3 }) },
  ],
  ...overrides,
})

const renderView = (
  props: Partial<ComponentProps<typeof GoogleAdsStatsView>> = {},
) =>
  ui.render(
    <GoogleAdsStatsView
      action={null}
      channel={null}
      connected
      referenceNow="2026-09-02T12:00:00.000Z"
      stats={stats()}
      syncedActions={[{ id: "111", name: "Purchase" }]}
      workspaceCreatedAt={new Date("2026-01-01T00:00:00Z")}
      {...props}
    />,
  )

const tileValue = (label: string): string | undefined => {
  const heading = Array.from(ui.container.querySelectorAll("li")).find((item) =>
    item.textContent?.includes(label),
  )
  return heading?.querySelector(".text-2xl")?.textContent ?? undefined
}

describe("GoogleAdsStatsView tiles", () => {
  test("shows each bucket as the sum of its statuses", () => {
    renderView()

    expect(tileValue("googleAds.stats.tiles.confirmed")).toBe("3")
    expect(tileValue("googleAds.stats.tiles.awaitingGoogle")).toBe("6")
    expect(tileValue("googleAds.stats.tiles.queued")).toBe("2")
    expect(tileValue("googleAds.stats.tiles.failed")).toBe("1")
    expect(tileValue("googleAds.stats.tiles.skipped")).toBe("3")
  })

  test("formats the delivery rate as a percentage with its help text", () => {
    renderView()

    expect(tileValue("googleAds.stats.tiles.deliveryRate")).toBe("75%")
    expect(
      ui.container.querySelector(
        '[aria-label="googleAds.stats.tiles.deliveryRateHelp"]',
      ),
    ).not.toBeNull()
  })

  test("a null delivery rate shows the dash and its own explanation", () => {
    renderView({
      stats: stats({ totals: { ...stats().totals, deliveryRate: null } }),
    })

    expect(tileValue("googleAds.stats.tiles.deliveryRate")).toBe(
      "googleAds.stats.deliveryRateNone",
    )
    expect(
      ui.container.querySelector(
        '[aria-label="googleAds.stats.deliveryRateNoneHelp"]',
      ),
    ).not.toBeNull()
  })

  test("every tile has a help tooltip", () => {
    renderView()

    for (const key of [
      "confirmed",
      "awaitingGoogle",
      "queued",
      "failed",
      "skipped",
    ]) {
      expect(
        ui.container.querySelector(
          `[aria-label="googleAds.stats.tiles.${key}Help"]`,
        ),
      ).not.toBeNull()
    }
  })
})

describe("GoogleAdsStatsView confirmed value", () => {
  test("lists each currency separately and never sums across them", () => {
    renderView({
      stats: stats({
        confirmedValue: [
          { currency: "USD", value: "1240.5", count: 96 },
          { currency: "VND", value: "3100000", count: 32 },
        ],
      }),
    })

    const text = ui.container.textContent ?? ""
    expect(text).toContain("googleAds.stats.confirmedValueItem:$1,240.50,96")
    expect(text).toContain("googleAds.stats.confirmedValueItem:₫3,100,000,32")
    expect(text).not.toContain("googleAds.stats.moreCurrencies")
  })

  test("past five currencies the rest collapses into +N more with a tooltip", () => {
    const codes = ["USD", "EUR", "GBP", "JPY", "VND", "AUD", "CAD"]
    renderView({
      stats: stats({
        confirmedValue: codes.map((currency) => ({
          currency,
          value: "10",
          count: 1,
        })),
      }),
    })

    expect(ui.container.textContent).toContain(
      "googleAds.stats.moreCurrencies:2",
    )
    const tooltip = Array.from(
      ui.container.querySelectorAll('[data-testid="tooltip-content"]'),
    ).find((content) => content.textContent?.includes("A$10.00"))
    expect(tooltip?.querySelectorAll("span")).toHaveLength(2)
    expect(tooltip?.textContent).toContain("CA$10.00")
  })

  test("keeps every digit of a large decimal total", () => {
    const value = "12345678901234567890.12"
    renderView({
      stats: stats({
        confirmedValue: [{ currency: "USD", value, count: 1 }],
      }),
    })

    const exact = new Intl.NumberFormat("en", {
      style: "currency",
      currency: "USD",
    }).format(value as Intl.StringNumericLiteral)
    expect(exact).toBe("$12,345,678,901,234,567,890.12")
    expect(ui.container.textContent).toContain(exact)
  })

  test("an unknown currency code falls back to plain text instead of throwing", () => {
    renderView({
      stats: stats({
        confirmedValue: [{ currency: "ZZZZ", value: "5", count: 1 }],
      }),
    })

    expect(ui.container.textContent).toContain("5 ZZZZ")
  })

  test("nothing is shown without confirmed value", () => {
    renderView()

    expect(ui.container.textContent).not.toContain(
      "googleAds.stats.confirmedValue",
    )
  })
})

describe("GoogleAdsStatsView chart", () => {
  test("feeds the chart one bucket-summed row per day", () => {
    renderView()

    expect(mocks.barChartData).toEqual([
      {
        date: "2026-09-01",
        confirmed: 2,
        awaitingGoogle: 4,
        queued: 0,
        failed: 0,
        skipped: 0,
      },
      {
        date: "2026-09-02",
        confirmed: 1,
        awaitingGoogle: 0,
        queued: 2,
        failed: 1,
        skipped: 0,
      },
    ])
  })

  test("the tooltip titles a day with the formatted date, not the raw key", () => {
    renderView()

    expect(mocks.labelFormatter?.("2026-09-01")).toBe("Sep 1")
  })

  test("View as table swaps the chart for an accessible table of the same numbers", () => {
    renderView()
    // The per-day chart and the outcome donut both render a chart.
    const charts = () => ui.container.querySelectorAll('[data-testid="chart"]')
    expect(charts()).toHaveLength(2)

    const toggle = buttonByText(
      ui.container,
      "googleAds.stats.chart.viewAsTable",
    )
    expect(toggle?.getAttribute("aria-pressed")).toBe("false")
    click(toggle)

    expect(charts()).toHaveLength(1)
    const caption = ui.container.querySelector("caption")
    expect(caption?.textContent).toBe("googleAds.stats.chart.tableCaption")
    const headers = Array.from(
      ui.container.querySelectorAll("caption ~ thead th"),
    ).map((th) => th.textContent)
    expect(headers).toEqual([
      "googleAds.stats.chart.dateColumn",
      "googleAds.stats.tiles.confirmed",
      "googleAds.stats.tiles.awaitingGoogle",
      "googleAds.stats.tiles.queued",
      "googleAds.stats.tiles.failed",
      "googleAds.stats.tiles.skipped",
    ])
    const rows = Array.from(ui.container.querySelectorAll("tbody tr")).map(
      (row) =>
        Array.from(row.children)
          .map((cell) => cell.textContent)
          .join("|"),
    )
    expect(rows[0]).toBe("Sep 1|2|4|0|0|0")
    expect(rows[1]).toBe("Sep 2|1|0|2|1|0")
    expect(
      buttonByText(
        ui.container,
        "googleAds.stats.chart.viewAsTable",
      )?.getAttribute("aria-pressed"),
    ).toBe("true")
  })
})

describe("GoogleAdsStatsView breakdowns", () => {
  test("by-action rows fall back to 'Action {id}' for a null name", () => {
    renderView()

    const text = ui.container.textContent ?? ""
    expect(text).toContain("Purchase")
    expect(text).toContain("PURCHASE")
    expect(text).toContain("googleAds.stats.actionFallback:222")
  })

  test("shows the truncated note only when the action list was cut", () => {
    renderView()
    expect(ui.container.textContent).not.toContain(
      "googleAds.stats.byAction.truncated",
    )

    renderView({ stats: stats({ byActionTruncated: true }) })
    expect(ui.container.textContent).toContain(
      "googleAds.stats.byAction.truncated",
    )
  })

  test("failures by stage list Unknown only when it has rows", () => {
    renderView()
    expect(ui.container.textContent).not.toContain(
      "googleAds.stats.failures.unknown",
    )

    renderView({
      stats: stats({
        failuresByStage: { delivery: 1, processing: 0, timeout: 0, unknown: 2 },
      }),
    })
    expect(ui.container.textContent).toContain(
      "googleAds.stats.failures.unknown",
    )
  })

  test("by channel shows the confirmed count per channel", () => {
    renderView()

    expect(ui.container.textContent).toContain(
      "googleAds.stats.byChannel.confirmedCount:3",
    )
  })
})

describe("GoogleAdsStatsView states", () => {
  const empty = () =>
    stats({
      totals: { ...counts(), total: 0, deliveryRate: null },
      timeseries: [],
      byAction: [],
      byChannel: [],
      failuresByStage: { delivery: 0, processing: 0, timeout: 0, unknown: 0 },
    })

  test("empty and connected: a hint, then the dashboard at zero", () => {
    renderView({ stats: empty() })

    expect(ui.container.textContent).toContain("googleAds.stats.empty.title")
    expect(ui.container.querySelector("a[href*=settings]")).toBeNull()
    expect(tileValue("googleAds.stats.tiles.confirmed")).toBe("0")
    // Channels are listed at zero even though nothing was recorded.
    expect(ui.container.textContent).toContain(
      "googleAds.stats.byChannel.title",
    )
    expect(ui.container.textContent).toContain(
      "googleAds.stats.byChannel.confirmedCount:0",
    )
  })

  test("empty and connected: the synced actions are listed at zero", () => {
    renderView({ stats: empty() })

    const rowHeads = Array.from(
      ui.container.querySelectorAll('th[scope="row"]'),
    ).map((cell) => cell.textContent)
    expect(rowHeads).toContain("Purchase")
  })

  test("empty and not connected: links to the settings", () => {
    renderView({ stats: empty(), connected: false })

    expect(ui.container.querySelector("ul")).toBeNull()

    expect(
      ui.container.querySelector(
        'a[href="/space/ws-1/settings/integrations/google-ads"]',
      ),
    ).not.toBeNull()
  })

  test("not connected but with history: still shows the history, with no extra note", () => {
    renderView({ connected: false })

    expect(tileValue("googleAds.stats.tiles.confirmed")).toBe("3")
    expect(ui.container.textContent).not.toContain(
      "googleAds.stats.empty.title",
    )
  })

  test("has no page title, description or basis note: only filters then content", () => {
    renderView()

    for (const key of ["title", "description", "basisHelp"]) {
      expect(ui.container.textContent).not.toContain(`googleAds.stats.${key}`)
    }
  })

  test("not pending: content is neither dimmed nor busy", () => {
    renderView()

    const busy = ui.container.querySelector("[aria-busy]")
    expect(busy?.getAttribute("aria-busy")).toBe("false")
    expect(busy?.className).not.toContain("opacity-60")
  })

  test("a navigation in flight dims the content and marks it busy", () => {
    mocks.isPending = true
    renderView()

    const busy = ui.container.querySelector("[aria-busy]")
    expect(busy?.getAttribute("aria-busy")).toBe("true")
    expect(busy?.className).toContain("opacity-60")
  })
})

describe("GoogleAdsStatsView filters", () => {
  test("channel and action selects carry accessible labels", () => {
    renderView()

    const labels = Array.from(
      ui.container.querySelectorAll('[data-testid="select-label"]'),
    ).map((label) => label.textContent)
    expect(labels).toEqual([
      "googleAds.stats.filters.channelLabel",
      "googleAds.stats.filters.actionLabel",
    ])
  })

  test("picking a channel keeps the other params and sets channel", () => {
    mocks.search = new URLSearchParams(
      "from=2026-09-01&to=2026-09-02&tz=Asia%2FHo_Chi_Minh",
    )
    renderView()

    const [channelSelect] = Array.from(ui.container.querySelectorAll("select"))
    choose(channelSelect, "messenger")

    expect(mocks.push).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/google?from=2026-09-01&to=2026-09-02&tz=Asia%2FHo_Chi_Minh&channel=messenger",
    )
  })

  test("choosing All actions removes the action param", () => {
    mocks.search = new URLSearchParams("tz=Asia%2FHo_Chi_Minh&action=111")
    renderView({ action: "111" })

    const selects = Array.from(ui.container.querySelectorAll("select"))
    choose(selects[1], "")

    expect(mocks.push).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/google?tz=Asia%2FHo_Chi_Minh",
    )
  })

  test("the action select offers synced actions and data-only ones", () => {
    renderView()

    const options = Array.from(
      ui.container.querySelectorAll("select")[1].querySelectorAll("option"),
    ).map((option) => [option.value, option.textContent])
    expect(options).toEqual([
      ["", "googleAds.stats.filters.allActions"],
      ["111", "Purchase"],
      ["222", "googleAds.stats.actionFallback:222"],
    ])
  })

  test("a stale selected action still has an option", () => {
    renderView({ action: "999" })

    const select = ui.container.querySelectorAll("select")[1]
    expect(select.value).toBe("999")
  })

  test("picking a date range pushes local day keys and the browser timezone", () => {
    mocks.search = new URLSearchParams("tz=Asia%2FHo_Chi_Minh&channel=whatsapp")
    renderView({ channel: "whatsapp" })

    click(ui.container.querySelector('[data-testid="pick-range"]'))

    const url = new URL(mocks.push.mock.calls[0][0], "http://x")
    expect(url.searchParams.get("from")).toBe("2026-01-01")
    expect(url.searchParams.get("to")).toBe("2026-01-07")
    expect(url.searchParams.get("channel")).toBe("whatsapp")
    expect(url.searchParams.get("tz")).toBeTruthy()
  })
})

describe("GoogleAdsStatsView timezone", () => {
  const browserZone = (timeZone: string) =>
    vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({ timeZone } as Intl.ResolvedDateTimeFormatOptions)

  test("adds the browser tz once with replace when the URL has none", () => {
    mocks.search = new URLSearchParams("channel=whatsapp")
    browserZone("Asia/Ho_Chi_Minh")
    renderView({
      stats: stats({
        range: { from: "2026-09-01", to: "2026-09-02", tz: "UTC" },
      }),
    })

    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.replace).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/ads/google?channel=whatsapp&tz=Asia%2FHo_Chi_Minh",
    )
    expect(mocks.push).not.toHaveBeenCalled()
  })

  test("adds the tz again after a later tz-less navigation, without looping", () => {
    mocks.search = new URLSearchParams("channel=whatsapp")
    browserZone("Asia/Ho_Chi_Minh")
    const element = () => (
      <GoogleAdsStatsView
        action={null}
        channel={null}
        connected
        referenceNow="2026-09-02T12:00:00.000Z"
        stats={stats({
          range: { from: "2026-09-01", to: "2026-09-02", tz: "UTC" },
        })}
        syncedActions={[]}
        workspaceCreatedAt={new Date("2026-01-01T00:00:00Z")}
      />
    )
    ui.render(element())
    expect(mocks.replace).toHaveBeenCalledTimes(1)

    mocks.search = new URLSearchParams("channel=whatsapp&tz=Asia%2FHo_Chi_Minh")
    ui.render(element())
    expect(mocks.replace).toHaveBeenCalledTimes(1)

    mocks.search = new URLSearchParams()
    ui.render(element())
    expect(mocks.replace).toHaveBeenCalledTimes(2)
  })

  test("a filter change before the tz replace settles still carries the tz", () => {
    mocks.search = new URLSearchParams("channel=whatsapp")
    browserZone("Asia/Ho_Chi_Minh")
    renderView({
      stats: stats({
        range: { from: "2026-09-01", to: "2026-09-02", tz: "UTC" },
      }),
    })
    expect(mocks.replace).toHaveBeenCalledTimes(1)

    // The URL has not updated yet: the search params are still tz-less.
    choose(ui.container.querySelectorAll("select")[1], "111")

    const url = new URL(mocks.push.mock.calls[0][0], "http://x")
    expect(url.searchParams.get("tz")).toBe("Asia/Ho_Chi_Minh")
    expect(url.searchParams.get("action")).toBe("111")
    expect(mocks.replace).toHaveBeenCalledTimes(1)
  })

  test("does nothing when the URL already carries a tz", () => {
    browserZone("Asia/Ho_Chi_Minh")
    renderView()

    expect(mocks.replace).not.toHaveBeenCalled()
  })

  test("does nothing when the browser zone is already the resolved one", () => {
    mocks.search = new URLSearchParams()
    browserZone("UTC")
    renderView({
      stats: stats({
        range: { from: "2026-09-01", to: "2026-09-02", tz: "UTC" },
      }),
    })

    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

function choose(select: HTMLSelectElement, value: string) {
  // React tracks the value setter; assign through the prototype so onChange fires.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set
  act(() => {
    setter?.call(select, value)
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
