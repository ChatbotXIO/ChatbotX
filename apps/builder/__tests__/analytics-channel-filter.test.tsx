// @vitest-environment jsdom

import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

type FilterValue = { channels: string[]; inboxIds: string[] }

const mocks = vi.hoisted(() => ({
  pathname: { current: "/space/ws-1/dashboard/contacts" },
  urlFilters: { current: { channels: [], inboxIds: [] } as FilterValue },
  setUrlFilters: vi.fn(),
  store: {
    state: { channels: [], inboxIds: [] } as FilterValue,
    setFilters: vi.fn(
      (_value: FilterValue): Promise<void> => Promise.resolve(),
    ),
  },
  viewProps: { current: null as null | Record<string, unknown> },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname.current,
}))
vi.mock("nuqs", () => ({
  useQueryStates: () => [mocks.urlFilters.current, mocks.setUrlFilters],
}))
vi.mock("@chatbotx.io/analytics-nextjs/components/channel-filter", () => ({
  AnalysisChannelFilterView: (props: {
    trailing?: ReactNode
    value: FilterValue
    options: unknown[]
  }) => {
    mocks.viewProps.current = props
    return <div data-package-filter>{props.trailing}</div>
  },
}))
vi.mock(
  "@chatbotx.io/analytics-nextjs/provider/analysis-store-context",
  () => ({
    useAnalysisStore: (
      selector: (state: {
        channels: string[]
        inboxIds: string[]
        setFilters: typeof mocks.store.setFilters
      }) => unknown,
    ) => selector({ ...mocks.store.state, setFilters: mocks.store.setFilters }),
  }),
)
vi.mock("@/features/analytics/components/analytics-section-select", () => ({
  AnalyticsSectionSelect: () => <span data-trailing />,
}))
vi.mock("@/features/inboxes/components/inbox-icon", () => ({
  getChannelIcon: () => null,
}))

const { AnalyticsChannelFilter, AnalyticsFilterStoreSync } = await import(
  "@/features/analytics/components/analytics-channel-filter"
)

describe("shared Analytics filter row", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async (node: ReactNode) => {
    await act(() => {
      root.render(node)
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.pathname.current = "/space/ws-1/dashboard/contacts"
    mocks.urlFilters.current = { channels: [], inboxIds: [] }
    mocks.store.state = { channels: [], inboxIds: [] }
    mocks.setUrlFilters.mockClear()
    mocks.store.setFilters.mockClear()
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

  const options = [{ id: "1", name: "Page", channel: "messenger" as const }]

  test.each([
    "/space/ws-1/dashboard/contacts",
    "/space/ws-1/dashboard/conversations",
    "/space/ws-1/dashboard/posts",
    "/space/ws-1/dashboard/ads/whatsapp",
    "/space/ws-1/dashboard/ads/google",
  ])("renders the same row, with the section select, on %s", async (path) => {
    mocks.pathname.current = path

    await render(
      <AnalyticsChannelFilter
        canAppendUnlisted
        options={options}
        sections={[]}
      />,
    )

    expect(
      container.querySelector("[data-package-filter] [data-trailing]"),
    ).not.toBeNull()
  })

  test("takes its selection from the URL", async () => {
    mocks.urlFilters.current = { channels: ["messenger"], inboxIds: ["1"] }

    await render(
      <AnalyticsChannelFilter
        canAppendUnlisted
        options={options}
        sections={[]}
      />,
    )

    expect(mocks.viewProps.current?.value).toEqual({
      channels: ["messenger"],
      inboxIds: ["1"],
    })
  })

  test("writes a changed selection to the URL", async () => {
    await render(
      <AnalyticsChannelFilter
        canAppendUnlisted
        options={options}
        sections={[]}
      />,
    )

    const onChange = mocks.viewProps.current?.onChange as (
      value: FilterValue,
    ) => void
    onChange({ channels: ["messenger"], inboxIds: [] })

    expect(mocks.setUrlFilters).toHaveBeenCalledWith(
      { channels: ["messenger"], inboxIds: [] },
      { shallow: true },
    )
  })

  test.each([
    "/space/ws-1/dashboard/ads/whatsapp",
    "/space/ws-1/dashboard/ads/messenger",
    "/space/ws-1/dashboard/ads/instagram",
    "/space/ws-1/dashboard/ads/google",
  ])("on %s a change re-renders the server page and drops the legacy link params", async (path) => {
    mocks.pathname.current = path
    await render(
      <AnalyticsChannelFilter
        canAppendUnlisted
        options={options}
        sections={[]}
      />,
    )

    const onChange = mocks.viewProps.current?.onChange as (
      value: FilterValue,
    ) => void
    onChange({ channels: [], inboxIds: ["1"] })

    expect(mocks.setUrlFilters).toHaveBeenCalledWith(
      {
        channels: [],
        inboxIds: ["1"],
        channelAccount: null,
        account: null,
        channel: null,
      },
      { shallow: false },
    )
  })

  test.each([
    "/space/ws-1/dashboard/contacts",
    "/space/ws-1/dashboard/conversations",
    "/space/ws-1/dashboard/posts",
  ])("on %s a change stays client-side and leaves other params alone", async (path) => {
    mocks.pathname.current = path
    await render(
      <AnalyticsChannelFilter
        canAppendUnlisted
        options={options}
        sections={[]}
      />,
    )

    const onChange = mocks.viewProps.current?.onChange as (
      value: FilterValue,
    ) => void
    onChange({ channels: [], inboxIds: ["1"] })

    expect(mocks.setUrlFilters).toHaveBeenCalledWith(
      { channels: [], inboxIds: ["1"] },
      { shallow: true },
    )
  })

  test("with zero inboxes it still renders the full row (the pickers disabled by the view)", async () => {
    await render(
      <AnalyticsChannelFilter canAppendUnlisted options={[]} sections={[]} />,
    )

    expect(
      container.querySelector("[data-package-filter] [data-trailing]"),
    ).not.toBeNull()
    expect(mocks.viewProps.current?.options).toEqual([])
  })

  test("renders nothing on a page that is not a section", async () => {
    mocks.pathname.current = "/space/ws-1/dashboard/ads/conversion-events"

    await render(
      <AnalyticsChannelFilter
        canAppendUnlisted
        options={options}
        sections={[]}
      />,
    )

    expect(container.innerHTML).toBe("")
  })

  test("the store sync pushes a URL selection the store does not have yet", async () => {
    mocks.urlFilters.current = {
      channels: ["messenger"],
      inboxIds: ["2", "1"],
    }

    await render(<AnalyticsFilterStoreSync />)

    expect(mocks.store.setFilters).toHaveBeenCalledWith({
      channels: ["messenger"],
      inboxIds: ["1", "2"],
    })
  })

  test("the store sync reloads exactly once per URL transition A to B to back to A", async () => {
    const A = { channels: [], inboxIds: [] }
    const B = { channels: ["messenger"], inboxIds: ["1"] }
    mocks.store.setFilters.mockImplementation((value: FilterValue) => {
      mocks.store.state = value
      return Promise.resolve()
    })

    await render(<AnalyticsFilterStoreSync />)
    expect(mocks.store.setFilters).not.toHaveBeenCalled()

    mocks.urlFilters.current = B
    await render(<AnalyticsFilterStoreSync />)
    await render(<AnalyticsFilterStoreSync />)
    expect(mocks.store.setFilters).toHaveBeenCalledTimes(1)
    expect(mocks.store.setFilters).toHaveBeenLastCalledWith(B)

    mocks.urlFilters.current = A
    await render(<AnalyticsFilterStoreSync />)
    await render(<AnalyticsFilterStoreSync />)
    expect(mocks.store.setFilters).toHaveBeenCalledTimes(2)
    expect(mocks.store.setFilters).toHaveBeenLastCalledWith(A)
  })

  test("the store sync does nothing when the store already matches the URL", async () => {
    mocks.urlFilters.current = { channels: ["messenger"], inboxIds: [] }
    mocks.store.state = { channels: ["messenger"], inboxIds: [] }

    await render(<AnalyticsFilterStoreSync />)

    expect(mocks.store.setFilters).not.toHaveBeenCalled()
  })
})
