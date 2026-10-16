import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  AnalysisChannelFilter,
  type AnalysisFilterOption,
} from "../src/components/channel-filter"

const mockSetFilters = vi.fn()
const storeState = {
  channels: [] as string[],
  inboxIds: [] as string[],
  setFilters: mockSetFilters,
}

vi.mock("../src/provider/analysis-store-context", () => ({
  useAnalysisStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key
    t.has = (key: string) => key.startsWith("fields.")
    return t
  },
}))

type StubOption = { value: string; label: string; description?: string }
type StubGroup = { heading: string; options: StubOption[] }

const flatten = (options: StubOption[] | StubGroup[]): StubOption[] =>
  options.flatMap((entry) => ("options" in entry ? entry.options : [entry]))

// The real picker (covered by `packages/ui/__tests__/multi-select-select-all`)
// is a Radix popover; here what matters is the contract the filter drives:
// options and ticked values in, the newly ticked values out.
vi.mock("@chatbotx.io/ui/components/ui/sersavan/multi-select", () => ({
  MultiSelect: ({
    options,
    defaultValue = [],
    onValueChange,
    placeholder,
  }: {
    options: StubOption[] | StubGroup[]
    defaultValue?: string[]
    onValueChange: (values: string[]) => void
    placeholder: string
  }) => {
    const flat = flatten(options)
    return (
      <div data-select={placeholder}>
        <span data-selected>{defaultValue.join(",")}</span>
        {options.map((entry) =>
          "options" in entry ? (
            <span data-heading key={entry.heading}>
              {entry.heading}
            </span>
          ) : null,
        )}
        <button
          data-select-all
          onClick={() =>
            onValueChange(
              defaultValue.length === flat.length
                ? []
                : flat.map((option) => option.value),
            )
          }
          type="button"
        />
        {flat.map((option) => (
          <button
            data-option={option.value}
            key={option.value}
            onClick={() =>
              onValueChange(
                defaultValue.includes(option.value)
                  ? defaultValue.filter((value) => value !== option.value)
                  : [...defaultValue, option.value],
              )
            }
            type="button"
          >
            {option.label}
            {option.description ? ` (${option.description})` : ""}
          </button>
        ))}
      </div>
    )
  },
}))

const OPTIONS: AnalysisFilterOption[] = [
  { id: "1", name: "Shop page", channel: "messenger" },
  { id: "2", name: "Support page", channel: "messenger" },
  { id: "3", name: "Sales line", channel: "whatsapp" },
  { id: "4", name: "Old bot", channel: "telegram" },
]

const CHANNELS = "analytics.filters.allChannels"
const INBOXES = "analytics.filters.allInboxes"

describe("AnalysisChannelFilter", () => {
  let container: HTMLDivElement
  let root: Root

  const select = (placeholder: string) =>
    container.querySelector(`[data-select="${placeholder}"]`) as HTMLElement
  const ticked = (placeholder: string) =>
    (select(placeholder).querySelector("[data-selected]")?.textContent ?? "")
      .split(",")
      .filter(Boolean)
  const optionValues = (placeholder: string) =>
    [...select(placeholder).querySelectorAll("[data-option]")].map((node) =>
      node.getAttribute("data-option"),
    )
  const headings = (placeholder: string) =>
    [...select(placeholder).querySelectorAll("[data-heading]")].map(
      (node) => node.textContent,
    )
  const press = async (node: Element | null) => {
    await act(() => {
      ;(node as HTMLButtonElement).click()
    })
  }
  const click = (placeholder: string, value: string) =>
    press(select(placeholder).querySelector(`[data-option="${value}"]`))
  const clickAll = (placeholder: string) =>
    press(select(placeholder).querySelector("[data-select-all]"))
  const flushDebounce = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
  }
  const render = async (options: AnalysisFilterOption[] = OPTIONS) => {
    await act(() => {
      root.render(<AnalysisChannelFilter options={options} />)
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
    mockSetFilters.mockReset()
    mockSetFilters.mockResolvedValue(undefined)
    storeState.channels = []
    storeState.inboxIds = []
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.useRealTimers()
  })

  test("starts on All with every channel and inbox ticked, and commits nothing", async () => {
    await render()
    await flushDebounce()

    expect(ticked(CHANNELS).sort()).toEqual([
      "messenger",
      "telegram",
      "whatsapp",
    ])
    expect(ticked(INBOXES).sort()).toEqual(["1", "2", "3", "4"])
    expect(mockSetFilters).not.toHaveBeenCalled()
  })

  test("groups inboxes under their channel, in the Channel picker's order", async () => {
    await render()

    expect(headings(INBOXES)).toEqual([
      "fields.messenger.label",
      "fields.telegram.label",
      "fields.whatsapp.label",
    ])
    expect(optionValues(INBOXES)).toEqual(["1", "2", "4", "3"])
  })

  test("sorts inboxes by name inside each channel group", async () => {
    await render([
      { id: "b", name: "Zeta", channel: "messenger" },
      { id: "a", name: "Alpha", channel: "messenger" },
    ])

    expect(optionValues(INBOXES)).toEqual(["a", "b"])
  })

  test("All unticks everything; ticking one inbox then filters to it", async () => {
    await render()
    await clickAll(INBOXES)
    expect(ticked(INBOXES)).toEqual([])
    await flushDebounce()
    // Nothing ticked is still "no filter".
    expect(mockSetFilters).not.toHaveBeenCalled()

    await click(INBOXES, "3")
    await flushDebounce()

    expect(mockSetFilters).toHaveBeenCalledExactlyOnceWith({
      channels: [],
      inboxIds: ["3"],
    })
  })

  test("All ticks every inbox again and goes back to no filter", async () => {
    await render()
    await clickAll(INBOXES)
    await click(INBOXES, "1")
    await flushDebounce()
    expect(ticked(INBOXES)).toEqual(["1"])
    storeState.inboxIds = ["1"]
    mockSetFilters.mockClear()

    await clickAll(INBOXES)
    expect(ticked(INBOXES).sort()).toEqual(["1", "2", "3", "4"])
    await flushDebounce()

    expect(mockSetFilters).toHaveBeenCalledExactlyOnceWith({
      channels: [],
      inboxIds: [],
    })
  })

  test("unticking one inbox filters to the rest", async () => {
    await render()
    await click(INBOXES, "4")
    await flushDebounce()

    expect(mockSetFilters).toHaveBeenCalledExactlyOnceWith({
      channels: [],
      inboxIds: ["1", "2", "3"],
    })
  })

  test("unticking a channel filters to the others and drops its inboxes from the list", async () => {
    await render()
    await click(CHANNELS, "telegram")

    expect(optionValues(INBOXES)).toEqual(["1", "2", "3"])
    // A fully ticked inbox list follows the channels, so no inbox filter.
    expect(ticked(INBOXES).sort()).toEqual(["1", "2", "3"])
    await flushDebounce()
    expect(mockSetFilters).toHaveBeenCalledExactlyOnceWith({
      channels: ["messenger", "whatsapp"],
      inboxIds: [],
    })
  })

  test("a partial inbox selection keeps only inboxes of the still-ticked channels", async () => {
    await render()
    await clickAll(INBOXES)
    await click(INBOXES, "1")
    await click(INBOXES, "3")

    await click(CHANNELS, "whatsapp")
    await flushDebounce()

    expect(ticked(INBOXES)).toEqual(["1"])
    expect(mockSetFilters).toHaveBeenCalledExactlyOnceWith({
      channels: ["messenger", "telegram"],
      inboxIds: ["1"],
    })
  })

  test("a burst of clicks becomes one reload", async () => {
    await render()
    await click(INBOXES, "1")
    await click(INBOXES, "2")
    await click(INBOXES, "2")
    await flushDebounce()

    expect(mockSetFilters).toHaveBeenCalledTimes(1)
    expect(mockSetFilters).toHaveBeenCalledWith({
      channels: [],
      inboxIds: ["2", "3", "4"],
    })
  })

  test("over the limit shows a message and commits nothing", async () => {
    const many = Array.from({ length: 202 }, (_, index) => ({
      id: String(index + 1),
      name: `Inbox ${String(index + 1).padStart(3, "0")}`,
      channel: "messenger" as const,
    }))
    await render(many)

    await click(INBOXES, "1")
    await flushDebounce()

    expect(container.textContent).toContain(
      'analytics.filters.tooManyInboxes:{"max":200}',
    )
    expect(mockSetFilters).not.toHaveBeenCalled()
  })

  test("shows the history hint while any filter is active", async () => {
    await render()
    expect(container.textContent).not.toContain("analytics.filters.filterHint")

    await click(CHANNELS, "telegram")
    expect(container.textContent).toContain("analytics.filters.filterHint")

    await click(CHANNELS, "telegram")
    expect(container.textContent).not.toContain("analytics.filters.filterHint")

    await click(INBOXES, "3")
    expect(container.textContent).toContain("analytics.filters.filterHint")
  })

  test("removing the channel of the only unticked inbox goes back to no inbox filter", async () => {
    await render()
    await click(INBOXES, "3")
    await flushDebounce()
    expect(mockSetFilters).toHaveBeenLastCalledWith({
      channels: [],
      inboxIds: ["1", "2", "4"],
    })
    storeState.inboxIds = ["1", "2", "4"]

    await click(CHANNELS, "whatsapp")
    await flushDebounce()

    expect(ticked(INBOXES).sort()).toEqual(["1", "2", "4"])
    expect(mockSetFilters).toHaveBeenLastCalledWith({
      channels: ["messenger", "telegram"],
      inboxIds: [],
    })
  })

  test("All keeps meaning everything when a new inbox appears", async () => {
    await render()
    await act(() => {
      root.render(
        <AnalysisChannelFilter
          options={[
            ...OPTIONS,
            { id: "5", name: "New page", channel: "messenger" },
          ]}
        />,
      )
    })
    await flushDebounce()

    expect(ticked(INBOXES).sort()).toEqual(["1", "2", "3", "4", "5"])
    expect(mockSetFilters).not.toHaveBeenCalled()
  })

  test("a failed reload does not throw out of the debounce timer", async () => {
    mockSetFilters.mockRejectedValue(new Error("boom"))
    await render()
    await click(INBOXES, "1")

    await expect(flushDebounce()).resolves.toBeUndefined()
  })
})
