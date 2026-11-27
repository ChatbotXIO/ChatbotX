import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  AnalysisChannelFilter,
  AnalysisChannelFilterView,
  type AnalysisFilterOption,
  type AnalysisFilterValue,
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
    disabled = false,
  }: {
    disabled?: boolean
    options: StubOption[] | StubGroup[]
    defaultValue?: string[]
    onValueChange: (values: string[]) => void
    placeholder: string
  }) => {
    const flat = flatten(options)
    return (
      <div data-disabled={disabled} data-select={placeholder}>
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
    // The store echoes the committed selection back before the next click.
    storeState.inboxIds = ["1"]
    await render()
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

  test("an active filter shows no history note under the row", async () => {
    await render()

    await click(CHANNELS, "telegram")
    await click(INBOXES, "3")

    expect(ticked(CHANNELS)).toEqual(["messenger", "whatsapp"])
    expect(container.querySelector("p")).toBeNull()
  })

  test("with no options both pickers render disabled and the trailing control stays", async () => {
    await act(() => {
      root.render(
        <AnalysisChannelFilter
          options={[]}
          trailing={<span data-trailing />}
        />,
      )
    })

    expect(select(CHANNELS).getAttribute("data-disabled")).toBe("true")
    expect(select(INBOXES).getAttribute("data-disabled")).toBe("true")
    expect(container.querySelector("[data-trailing]")).not.toBeNull()
  })

  test("the trailing column is wide enough for the longest localized section label", async () => {
    await act(() => {
      root.render(
        <AnalysisChannelFilter
          options={OPTIONS}
          trailing={<span data-trailing />}
        />,
      )
    })

    expect(
      container.querySelector("[data-trailing]")?.parentElement?.className,
    ).toContain("sm:w-80")
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

  test("renders the trailing control after the Inbox picker", async () => {
    await act(() => {
      root.render(
        <AnalysisChannelFilter
          options={OPTIONS}
          trailing={<span data-trailing />}
        />,
      )
    })

    const order = [
      ...container.querySelectorAll("[data-select], [data-trailing]"),
    ].map((node) => node.getAttribute("data-select") ?? "trailing")
    expect(order).toEqual([CHANNELS, INBOXES, "trailing"])
  })

  test("the control row wraps at sm so three controls never overflow", async () => {
    await act(() => {
      root.render(
        <AnalysisChannelFilter
          options={OPTIONS}
          trailing={<span data-trailing />}
        />,
      )
    })

    const row =
      container.querySelector("[data-trailing]")?.parentElement?.parentElement
    expect(row?.className).toContain("sm:flex-wrap")
    expect(row?.className).toContain("sm:flex-row")
  })

  test("renders no trailing wrapper when none is given", async () => {
    await render()

    expect(container.querySelector("[data-trailing]")).toBeNull()
  })
})

describe("AnalysisChannelFilterView", () => {
  let container: HTMLDivElement
  let root: Root

  const ticked = (placeholder: string) =>
    (
      container.querySelector(`[data-select="${placeholder}"] [data-selected]`)
        ?.textContent ?? ""
    )
      .split(",")
      .filter(Boolean)
      .sort()
  const flushDebounce = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
  }
  const renderView = async (
    value: AnalysisFilterValue,
    onChange: (value: AnalysisFilterValue) => void,
  ) => {
    await act(() => {
      root.render(
        <AnalysisChannelFilterView
          onChange={onChange}
          options={OPTIONS}
          value={value}
        />,
      )
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.useFakeTimers()
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

  test("starts from the given value and does not use the dashboard store", async () => {
    const onChange = vi.fn()
    await renderView({ channels: ["whatsapp"], inboxIds: [] }, onChange)
    await flushDebounce()

    expect(ticked(CHANNELS)).toEqual(["whatsapp"])
    expect(ticked(INBOXES)).toEqual(["3"])
    expect(onChange).not.toHaveBeenCalled()
  })

  test("keeps a bookmarked channel that is no longer available instead of broadening it", async () => {
    const onChange = vi.fn()
    // "slack" has no connected inbox any more: it is not among the options.
    await renderView({ channels: ["slack" as never], inboxIds: [] }, onChange)
    await flushDebounce()

    expect(onChange).not.toHaveBeenCalled()
  })

  test("keeps a bookmarked inbox that no longer exists next to one that does", async () => {
    const onChange = vi.fn()
    await renderView({ channels: [], inboxIds: ["1", "gone"] }, onChange)
    await flushDebounce()

    expect(onChange).not.toHaveBeenCalled()
    expect(ticked(INBOXES)).toEqual(["1"])
  })

  test("keeps an explicit inbox selection untouched on load", async () => {
    const onChange = vi.fn()
    await renderView({ channels: [], inboxIds: ["1", "3"] }, onChange)
    await flushDebounce()

    expect(onChange).not.toHaveBeenCalled()
    expect(ticked(INBOXES)).toEqual(["1", "3"])
  })

  test("normalises an unavailable bookmarked value only after the user changes a picker", async () => {
    const onChange = vi.fn()
    await renderView({ channels: [], inboxIds: ["1", "gone"] }, onChange)

    await act(() => {
      ;(
        container.querySelector(
          `[data-select="${INBOXES}"] [data-option="2"]`,
        ) as HTMLButtonElement
      ).click()
    })
    await flushDebounce()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      channels: [],
      inboxIds: ["1", "2"],
    })
  })

  const click = (placeholder: string, value: string) =>
    act(() => {
      ;(
        container.querySelector(
          `[data-select="${placeholder}"] [data-option="${value}"]`,
        ) as HTMLButtonElement
      ).click()
    })

  test("choosing All reaches the callback even though the normalised value is unchanged (it clears a legacy link's params)", async () => {
    const onChange = vi.fn()
    await renderView({ channels: [], inboxIds: [] }, onChange)

    await act(() => {
      ;(
        container.querySelector(
          `[data-select="${INBOXES}"] [data-select-all]`,
        ) as HTMLButtonElement
      ).click()
    })
    await flushDebounce()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ channels: [], inboxIds: [] })
  })

  test("an acknowledged selection is not committed again when a refresh drops its option", async () => {
    const onChange = vi.fn()
    await renderView({ channels: [], inboxIds: [] }, onChange)
    await click(INBOXES, "3")
    await flushDebounce()
    expect(onChange).toHaveBeenCalledTimes(1)

    // The host echoes the commit back as the supplied value.
    await renderView({ channels: [], inboxIds: ["1", "2", "4"] }, onChange)
    // Options refresh: inbox 4 is gone, so the normalised selection changes.
    await act(() => {
      root.render(
        <AnalysisChannelFilterView
          onChange={onChange}
          options={OPTIONS.filter((option) => option.id !== "4")}
          value={{ channels: [], inboxIds: ["1", "2", "4"] }}
        />,
      )
    })
    await flushDebounce()

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test("an edit made after a commit stays pending when the first commit is acknowledged", async () => {
    const onChange = vi.fn()
    await renderView({ channels: [], inboxIds: [] }, onChange)
    await click(INBOXES, "3")
    await flushDebounce()
    expect(onChange).toHaveBeenLastCalledWith({
      channels: [],
      inboxIds: ["1", "2", "4"],
    })

    await click(INBOXES, "4")
    // The first commit comes back before the second is sent.
    await renderView({ channels: [], inboxIds: ["1", "2", "4"] }, onChange)
    await flushDebounce()

    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({
      channels: [],
      inboxIds: ["1", "2"],
    })
  })

  test("reports a user change, debounced, with sorted values", async () => {
    const onChange = vi.fn()
    await renderView({ channels: [], inboxIds: [] }, onChange)

    await act(() => {
      ;(
        container.querySelector(
          `[data-select="${INBOXES}"] [data-option="3"]`,
        ) as HTMLButtonElement
      ).click()
    })
    expect(onChange).not.toHaveBeenCalled()
    await flushDebounce()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      channels: [],
      inboxIds: ["1", "2", "4"],
    })
  })

  test("follows a value changed from outside (browser back, shared link)", async () => {
    const onChange = vi.fn()
    await renderView({ channels: [], inboxIds: [] }, onChange)

    await renderView({ channels: ["messenger"], inboxIds: ["1"] }, onChange)
    await flushDebounce()

    expect(ticked(CHANNELS)).toEqual(["messenger"])
    expect(ticked(INBOXES)).toEqual(["1"])
    expect(onChange).not.toHaveBeenCalled()
  })

  describe("URL round trip (stateful host)", () => {
    const Host = ({
      url,
      onCommit,
    }: {
      url: AnalysisFilterValue
      onCommit: (value: AnalysisFilterValue) => void
    }) => (
      <AnalysisChannelFilterView
        onChange={onCommit}
        options={OPTIONS}
        value={url}
      />
    )
    const renderHost = async (
      url: AnalysisFilterValue,
      onCommit: (value: AnalysisFilterValue) => void,
    ) => {
      await act(() => {
        root.render(<Host onCommit={onCommit} url={url} />)
      })
    }
    const A: AnalysisFilterValue = { channels: [], inboxIds: [] }
    const B: AnalysisFilterValue = { channels: ["whatsapp"], inboxIds: [] }

    test("A to B to back to A follows each URL without committing, and cancels a pending pick", async () => {
      const onCommit = vi.fn()
      await renderHost(A, onCommit)

      // A pick is pending (300 ms) when the user navigates to B.
      await act(() => {
        ;(
          container.querySelector(
            `[data-select="${INBOXES}"] [data-option="3"]`,
          ) as HTMLButtonElement
        ).click()
      })
      await renderHost(B, onCommit)
      await flushDebounce()

      expect(ticked(CHANNELS)).toEqual(["whatsapp"])
      expect(ticked(INBOXES)).toEqual(["3"])
      expect(onCommit).not.toHaveBeenCalled()

      await renderHost(A, onCommit)
      await flushDebounce()

      expect(ticked(CHANNELS)).toEqual(["messenger", "telegram", "whatsapp"])
      expect(ticked(INBOXES)).toEqual(["1", "2", "3", "4"])
      expect(onCommit).not.toHaveBeenCalled()
    })

    test("a user change commits exactly once and its echo commits nothing more", async () => {
      const onCommit = vi.fn()
      await renderHost(A, onCommit)

      await act(() => {
        ;(
          container.querySelector(
            `[data-select="${CHANNELS}"] [data-option="telegram"]`,
          ) as HTMLButtonElement
        ).click()
      })
      await flushDebounce()
      expect(onCommit).toHaveBeenCalledTimes(1)
      const committed = onCommit.mock.calls[0]?.[0] as AnalysisFilterValue

      await renderHost(committed, onCommit)
      await flushDebounce()

      expect(onCommit).toHaveBeenCalledTimes(1)
    })
  })
})
