import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { DateRangePresetFilter } from "../src/components/date-range-preset-filter"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}))

vi.mock("@chatbotx.io/ui/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div data-testid="custom-range-dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => children,
  DialogFooter: ({ children }: { children: ReactNode }) => children,
  DialogHeader: ({ children }: { children: ReactNode }) => children,
  DialogTitle: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@chatbotx.io/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => children,
  DropdownMenuGroup: ({ children }: { children: ReactNode }) => children,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: ReactNode
    onClick?: () => void
  }) => (
    <button data-menu-item onClick={onClick} type="button">
      {children}
    </button>
  ),
  DropdownMenuTrigger: ({
    children,
    render,
  }: {
    children?: ReactNode
    render?: ReactNode
  }) => render ?? children,
}))

// Stands in for react-day-picker's Calendar — exposes one button that fires
// `onSelect` with a fixed range, so tests can drive the custom-range dialog
// without rendering the real day-grid.
const FAKE_CUSTOM_FROM = new Date("2026-08-01T12:00:00.000Z")
const FAKE_CUSTOM_TO = new Date("2026-08-05T12:00:00.000Z")

vi.mock("@chatbotx.io/ui/components/ui/calendar", () => ({
  Calendar: ({
    onSelect,
  }: {
    onSelect: (range: { from: Date; to: Date } | undefined) => void
  }) => (
    <button
      onClick={() => onSelect({ from: FAKE_CUSTOM_FROM, to: FAKE_CUSTOM_TO })}
      type="button"
    >
      select-fake-range
    </button>
  ),
}))

function findButtonByText(container: HTMLDivElement, text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === text,
  )
  if (!button) {
    throw new Error(`Button not found: ${text}`)
  }
  return button
}

/**
 * Preset dropdown items only — excludes the trigger button, whose own label
 * text equals a preset's item text once that preset is selected/default
 * (e.g. the trigger shows "fields.last7days.label" when `last7` is active,
 * same as the "Last 7 days" menu item).
 */
function findMenuItemByText(container: HTMLDivElement, text: string) {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button[data-menu-item]"),
  ).find((candidate) => candidate.textContent === text)
  if (!button) {
    throw new Error(`Menu item not found: ${text}`)
  }
  return button
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("DateRangePresetFilter", () => {
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

  test.each([
    [
      "fields.today.label",
      () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
    ],
    [
      "fields.yesterday.label",
      () => {
        const yesterday = subDays(new Date(), 1)
        return { from: startOfDay(yesterday), to: endOfDay(yesterday) }
      },
    ],
    [
      "fields.last7days.label",
      () => ({
        from: startOfDay(subDays(new Date(), 6)),
        to: endOfDay(new Date()),
      }),
    ],
    [
      "fields.last30days.label",
      () => ({
        from: startOfDay(subDays(new Date(), 29)),
        to: endOfDay(new Date()),
      }),
    ],
    [
      "fields.thisMonth.label",
      () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
    ],
  ])("selecting %s calls onChange with the matching range", async (label, expected) => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<DateRangePresetFilter onChange={onChange} />)
      await flush()
    })

    await act(async () => {
      findMenuItemByText(container, label).click()
      await flush()
    })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expected())
  })

  test("selecting the lifeTime preset floors to the 2020-01-01 partition floor by default", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<DateRangePresetFilter onChange={onChange} />)
      await flush()
    })

    await act(async () => {
      findMenuItemByText(container, "fields.lifeTime.label").click()
      await flush()
    })

    expect(onChange).toHaveBeenCalledWith({
      from: startOfDay(new Date("2020-01-01T00:00:00.000Z")),
      to: endOfDay(new Date()),
    })
  })

  test("selecting the lifeTime preset floors to workspaceCreatedAt when it is later than 2020-01-01", async () => {
    const onChange = vi.fn()
    const workspaceCreatedAt = new Date("2024-03-15T00:00:00.000Z")
    await act(async () => {
      root.render(
        <DateRangePresetFilter
          onChange={onChange}
          workspaceCreatedAt={workspaceCreatedAt}
        />,
      )
      await flush()
    })

    await act(async () => {
      findMenuItemByText(container, "fields.lifeTime.label").click()
      await flush()
    })

    expect(onChange).toHaveBeenCalledWith({
      from: startOfDay(workspaceCreatedAt),
      to: endOfDay(new Date()),
    })
  })

  test("the refresh button re-applies the last-7-days range", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<DateRangePresetFilter onChange={onChange} />)
      await flush()
    })

    const refreshButton =
      container.querySelectorAll<HTMLButtonElement>("form > button")[0]
    await act(async () => {
      refreshButton?.click()
      await flush()
    })

    expect(onChange).toHaveBeenCalledWith({
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    })
  })

  test("the custom-range dialog applies the selected range via onChange", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<DateRangePresetFilter onChange={onChange} />)
      await flush()
    })

    await act(async () => {
      findMenuItemByText(container, "fields.customRange.label").click()
      await flush()
    })

    expect(
      container.querySelector('[data-testid="custom-range-dialog"]'),
    ).not.toBeNull()

    await act(async () => {
      findButtonByText(container, "select-fake-range").click()
      await flush()
    })

    await act(async () => {
      findButtonByText(container, "actions.continue").click()
      await flush()
    })

    expect(onChange).toHaveBeenCalledWith({
      from: startOfDay(FAKE_CUSTOM_FROM),
      to: endOfDay(FAKE_CUSTOM_TO),
    })
    // The dialog closes after applying.
    expect(
      container.querySelector('[data-testid="custom-range-dialog"]'),
    ).toBeNull()
  })

  test("the clear button in the custom dialog resets the selection so continue stays disabled", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(<DateRangePresetFilter onChange={onChange} />)
      await flush()
    })

    await act(async () => {
      findMenuItemByText(container, "fields.customRange.label").click()
      await flush()
    })

    await act(async () => {
      findButtonByText(container, "select-fake-range").click()
      await flush()
    })

    await act(async () => {
      findButtonByText(container, "actions.clear").click()
      await flush()
    })

    const continueButton = findButtonByText(container, "actions.continue")
    expect(continueButton.hasAttribute("disabled")).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  test("respects defaultPreset — the dropdown trigger shows the matching label", async () => {
    const onChange = vi.fn()
    await act(async () => {
      root.render(
        <DateRangePresetFilter defaultPreset="lifeTime" onChange={onChange} />,
      )
      await flush()
    })

    const trigger = container.querySelector("#date-range-preset")
    expect(trigger?.textContent).toContain("fields.lifeTime.label")
  })

  test("respects initialFrom/initialTo — the trigger shows the formatted custom range", async () => {
    const onChange = vi.fn()
    const initialFrom = new Date("2026-08-01T00:00:00.000Z").getTime()
    const initialTo = new Date("2026-08-05T00:00:00.000Z").getTime()

    await act(async () => {
      root.render(
        <DateRangePresetFilter
          defaultPreset="custom"
          initialFrom={initialFrom}
          initialTo={initialTo}
          onChange={onChange}
        />,
      )
      await flush()
    })

    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
    const expectedText = `${new Date(initialFrom).toLocaleDateString(
      "en",
      options,
    )} - ${new Date(initialTo).toLocaleDateString("en", options)}`

    const trigger = container.querySelector("#date-range-preset")
    expect(trigger?.textContent).toContain(expectedText)
  })
})
