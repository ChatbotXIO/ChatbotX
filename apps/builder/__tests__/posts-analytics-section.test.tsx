// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  inboxState: {
    inboxes: [] as { channel: string }[],
    status: "success" as "pending" | "success",
  },
  pathname: "/space/ws-1/posts",
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}))
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("nuqs", () => ({
  useQueryStates: () => [
    { metric: "engagement", groupBy: "day", rankBy: "total" },
    vi.fn(),
  ],
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isPending: true }),
}))
vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInboxListState: () => mocks.inboxState,
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    postAnalyticsAPIs: {
      privatePostAnalyticsSummaryAPI: { queryOptions: () => ({}) },
    },
  },
}))
vi.mock("@/features/post-analytics/lib/search-params", () => ({
  analyticsSearchParsers: {},
  toAnalyticsScope: () => ({}),
}))
vi.mock("@/features/post-analytics/components/analytics-filters", () => ({
  AnalyticsFilters: ({ scopeFilters }: { scopeFilters: string }) => (
    <div data-filters data-scope-filters={scopeFilters} />
  ),
}))
vi.mock("@/features/post-analytics/components/best-times-card", () => ({
  BestTimesCard: () => null,
}))
vi.mock("@/features/post-analytics/components/breakdown-card", () => ({
  BreakdownCard: () => null,
}))
vi.mock("@/features/post-analytics/components/coverage-notice", () => ({
  CoverageNotice: () => null,
}))
vi.mock("@/features/post-analytics/components/kpi-tiles", () => ({
  KpiTiles: () => <div data-kpis />,
}))
vi.mock("@/features/post-analytics/components/timeseries-card", () => ({
  TimeseriesCard: () => null,
}))
vi.mock("@/features/post-analytics/components/top-posts-card", () => ({
  TopPostsCard: () => null,
}))
vi.mock("@chatbotx.io/ui/components/ui/button", () => ({
  buttonVariants: () => "",
}))

const { PostAnalyticsView } = await import(
  "@/features/post-analytics/components/analytics-view"
)
const { PostsTabs } = await import(
  "@/features/channel-posts/components/posts-tabs"
)

describe("Posts analytics section", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async (node: ReactNode) => {
    await act(() => {
      root.render(node)
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.inboxState.inboxes = [{ channel: "messenger" }]
    mocks.inboxState.status = "success"
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

  test("PostsTabs links to Analytics between Calendar and Feeds", async () => {
    await render(<PostsTabs workspaceId="ws-1" />)

    const hrefs = Array.from(container.querySelectorAll("a"))
      .map((a) => a.getAttribute("href"))
      .filter((href) => href !== "/space/ws-1/posts/create")
    expect(hrefs).toEqual([
      "/space/ws-1/posts",
      "/space/ws-1/posts/calendar",
      "/space/ws-1/posts/analytics",
      "/space/ws-1/posts/feeds",
      "/space/ws-1/posts/connect",
    ])
    expect(container.textContent).toContain("posts.tabs.analytics")
  })

  test("the Posts tab view passes its own channel and inbox filters through", async () => {
    await render(<PostAnalyticsView scopeFilters="own" workspaceId="ws-1" />)

    expect(
      container
        .querySelector("[data-filters]")
        ?.getAttribute("data-scope-filters"),
    ).toBe("own")
  })

  test("has no section select of its own (the dashboard layout renders it)", async () => {
    await render(<PostAnalyticsView scopeFilters="shared" workspaceId="ws-1" />)

    expect(
      container
        .querySelector("[data-filters]")
        ?.getAttribute("data-scope-filters"),
    ).toBe("shared")
    expect(container.querySelector("[data-section-select]")).toBeNull()
    expect(container.querySelector("[data-filters]")).not.toBeNull()
    expect(container.querySelector("[data-kpis]")).not.toBeNull()
  })

  test("still shows the empty state when no channel can post", async () => {
    mocks.inboxState.inboxes = [{ channel: "webchat" }]

    await render(<PostAnalyticsView scopeFilters="own" workspaceId="ws-1" />)

    expect(container.querySelector("[data-filters]")).toBeNull()
    expect(container.textContent).toContain("state.noChannelTitle")
  })
})
