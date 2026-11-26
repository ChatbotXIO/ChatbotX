// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))
vi.mock("nuqs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("nuqs")>()),
  useQueryStates: () => [
    {
      channels: [],
      contentTypes: [],
      from: null,
      inboxIds: [],
      to: null,
      topicIds: [],
    },
    vi.fn(),
  ],
}))
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { items: [{ id: "1", name: "Launch" }] } }),
}))
vi.mock("@/features/inboxes/lib/channel-label", () => ({
  channelLabel: (channel: string) => channel,
}))
vi.mock("@/features/inboxes/provider/inbox-hook", () => ({
  useInboxList: () => [{ channel: "messenger", id: "1", name: "Page" }],
}))
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    postAnalyticsAPIs: {
      privatePostAnalyticsTopicsAPI: { queryOptions: () => ({}) },
    },
  },
}))
vi.mock(
  "@chatbotx.io/analytics-nextjs/components/date-range-preset-filter",
  () => ({
    DateRangePresetFilter: () => <span data-date-filter />,
    resolvePresetOption: () => "last7",
  }),
)
vi.mock("@chatbotx.io/ui/components/ui/sersavan/multi-select", () => ({
  MultiSelect: ({ placeholder }: { placeholder: string }) => (
    <span data-multi-select={placeholder} />
  ),
}))

const { AnalyticsFilters } = await import(
  "@/features/post-analytics/components/analytics-filters"
)

describe("Posts analytics content filters", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async (node: ReactNode) => {
    await act(() => {
      root.render(node)
    })
  }

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

  test("shared: keeps content type and topic, and has no channel or inbox filter", async () => {
    await render(<AnalyticsFilters scopeFilters="shared" workspaceId="ws-1" />)

    const placeholders = Array.from(
      container.querySelectorAll("[data-multi-select]"),
    ).map((el) => el.getAttribute("data-multi-select"))
    expect(placeholders).toEqual([
      "posts.analytics.filters.allContentTypes",
      "posts.analytics.filters.allTopics",
    ])
  })

  test("own: shows channel and inbox filters before content type and topic", async () => {
    await render(<AnalyticsFilters scopeFilters="own" workspaceId="ws-1" />)

    const placeholders = Array.from(
      container.querySelectorAll("[data-multi-select]"),
    ).map((el) => el.getAttribute("data-multi-select"))
    expect(placeholders).toEqual([
      "posts.filters.allChannels",
      "posts.filters.allInboxes",
      "posts.analytics.filters.allContentTypes",
      "posts.analytics.filters.allTopics",
    ])
  })
})
